-- Video consultations booked through WhatsApp links (wa.me).
-- No message is ever sent automatically: the patient and the doctor tap
-- prefilled WhatsApp links, and the dashboard records what was sent.
-- Times are timestamptz (UTC); the app displays them in Asia/Kolkata.
-- Row-level security is on everywhere with no policies: only the server
-- (service role key) can read or write.

create extension if not exists btree_gist;

-- The old booking form kept its rows in "appointments" and promised to delete
-- each one after its appointment ended. Move that table aside, drop rows that
-- are already past, and the daily cleanup removes the rest as they expire.
do $$
begin
  if to_regclass('public.appointments') is not null
     and not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'appointments' and column_name = 'ref_code') then
    alter table public.appointments rename to legacy_booking_appointments;
    delete from public.legacy_booking_appointments where expires_at <= now();
    alter table public.legacy_booking_appointments enable row level security;
  end if;
end;
$$;

create function sweep_legacy_bookings() returns integer language plpgsql as $$
declare
  v_deleted integer := 0;
begin
  if to_regclass('public.legacy_booking_appointments') is not null then
    execute 'delete from public.legacy_booking_appointments where expires_at <= now()';
    get diagnostics v_deleted = row_count;
  end if;
  return v_deleted;
end;
$$;

create type consultation_status as enum (
  'requested', 'scheduled', 'rejected', 'cancelled', 'expired', 'completed', 'feedback_received'
);

create table doctors (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  qualification text not null default '',
  registration_no text not null,
  consult_minutes integer not null default 30 check (consult_minutes between 5 and 120),
  zoom_user text,
  created_at timestamptz not null default now()
);

-- Dashboard users. user_id is the Supabase Auth user.
create table staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  doctor_id uuid references doctors (id) on delete set null,
  role text not null default 'doctor' check (role in ('doctor', 'admin', 'staff')),
  display_name text not null,
  created_at timestamptz not null default now()
);

create table availability_rules (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references doctors (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_minute integer not null check (start_minute between 0 and 1439),
  end_minute integer not null check (end_minute between 1 and 1440),
  slot_minutes integer not null default 30 check (slot_minutes between 5 and 120),
  check (end_minute > start_minute)
);

create table consultations (
  id uuid primary key default gen_random_uuid(),
  ref_code text not null unique,
  doctor_id uuid not null references doctors (id),
  patient_name text not null check (length(trim(patient_name)) between 2 and 80),
  patient_phone text not null check (patient_phone ~ '^\+91[6-9][0-9]{9}$'),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  slot tstzrange generated always as (tstzrange(starts_at, ends_at, '[)')) stored,
  status consultation_status not null default 'requested',
  consent_at timestamptz not null,
  reject_reason text,
  meeting_provider text,
  meeting_id text,
  join_url text,
  start_url text,
  meeting_passcode text,
  accepted_at timestamptz,
  confirmation_sent_at timestamptz,
  link_reminder_sent_at timestamptz,
  feedback_request_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  -- The guarantee: a doctor never has two overlapping active consultations.
  constraint consultations_no_overlap exclude using gist (doctor_id with =, slot with &&)
    where (status in ('requested', 'scheduled'))
);
create index consultations_doctor_start on consultations (doctor_id, starts_at);
create index consultations_status on consultations (status);

-- Five-minute holds while a patient types their name and number.
create table slot_holds (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references doctors (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  slot tstzrange generated always as (tstzrange(starts_at, ends_at, '[)')) stored,
  hold_token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint slot_holds_no_overlap exclude using gist (doctor_id with =, slot with &&)
);

-- Append-only history of every status change and action.
create table consultation_events (
  id bigint generated always as identity primary key,
  consultation_id uuid not null references consultations (id) on delete cascade,
  from_status consultation_status,
  to_status consultation_status,
  actor text not null check (actor in ('patient', 'doctor', 'staff', 'system')),
  actor_id uuid,
  note text,
  created_at timestamptz not null default now()
);
create index consultation_events_consultation on consultation_events (consultation_id, id);

create function consultation_events_append_only() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and current_setting('app.allow_event_delete', true) = 'on' then
    return old;
  end if;
  raise exception 'consultation_events is append-only' using errcode = 'P0001';
end;
$$;
create trigger consultation_events_no_update before update on consultation_events
  for each row execute function consultation_events_append_only();
create trigger consultation_events_no_delete before delete on consultation_events
  for each row execute function consultation_events_append_only();

create function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger consultations_touch before update on consultations
  for each row execute function touch_updated_at();

create table feedback (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null unique references consultations (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text not null default '' check (length(comment) <= 1000),
  allow_public boolean not null default false,
  created_at timestamptz not null default now()
);

-- Editable settings: hospital WhatsApp number and message templates.
create table settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);

create function rate_limit_hit(p_key text, p_window_seconds integer, p_limit integer)
returns boolean language plpgsql as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into rate_limits as r (key, window_start, hits) values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning hits into v_hits;
  delete from rate_limits where window_start < now() - interval '1 day';
  return v_hits <= p_limit;
end;
$$;

-- Hold a slot. Fails with 'slot_taken' if an active consultation or someone
-- else's live hold overlaps. One hold per token: holding again replaces it.
create function hold_slot(p_doctor uuid, p_starts timestamptz, p_ends timestamptz, p_token_hash text, p_ttl_seconds integer)
returns timestamptz language plpgsql as $$
declare
  v_expires timestamptz := now() + make_interval(secs => p_ttl_seconds);
begin
  delete from slot_holds where doctor_id = p_doctor and expires_at <= now();
  delete from slot_holds where hold_token_hash = p_token_hash;
  if exists (
    select 1 from consultations
    where doctor_id = p_doctor and status in ('requested', 'scheduled')
      and slot && tstzrange(p_starts, p_ends, '[)')
  ) then
    raise exception 'slot_taken' using errcode = 'P0001';
  end if;
  begin
    insert into slot_holds (doctor_id, starts_at, ends_at, hold_token_hash, expires_at)
    values (p_doctor, p_starts, p_ends, p_token_hash, v_expires);
  exception when exclusion_violation then
    raise exception 'slot_taken' using errcode = 'P0001';
  end;
  return v_expires;
end;
$$;

-- Turn a live hold into a consultation request in one transaction.
create function create_request_from_hold(
  p_token_hash text, p_ref_code text, p_name text, p_phone text, p_consent_at timestamptz
) returns uuid language plpgsql as $$
declare
  v_hold slot_holds%rowtype;
  v_id uuid;
begin
  select * into v_hold from slot_holds where hold_token_hash = p_token_hash for update;
  if not found or v_hold.expires_at <= now() then
    raise exception 'hold_expired' using errcode = 'P0001';
  end if;
  begin
    insert into consultations (ref_code, doctor_id, patient_name, patient_phone, starts_at, ends_at, consent_at)
    values (p_ref_code, v_hold.doctor_id, p_name, p_phone, v_hold.starts_at, v_hold.ends_at, p_consent_at)
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'slot_taken' using errcode = 'P0001';
  end;
  delete from slot_holds where id = v_hold.id;
  insert into consultation_events (consultation_id, from_status, to_status, actor, note)
  values (v_id, null, 'requested', 'patient', 'Consultation requested');
  return v_id;
end;
$$;

-- Requests the doctor never answered expire once their time has passed.
create function expire_stale_requests() returns integer language plpgsql as $$
declare
  v_count integer;
begin
  with expired as (
    update consultations set status = 'expired'
    where status = 'requested' and starts_at <= now()
    returning id
  )
  insert into consultation_events (consultation_id, from_status, to_status, actor, note)
  select id, 'requested', 'expired', 'system', 'Not answered before the appointment time' from expired;
  get diagnostics v_count = row_count;
  delete from slot_holds where expires_at <= now();
  return v_count;
end;
$$;

alter table doctors enable row level security;
alter table staff enable row level security;
alter table availability_rules enable row level security;
alter table consultations enable row level security;
alter table slot_holds enable row level security;
alter table consultation_events enable row level security;
alter table feedback enable row level security;
alter table settings enable row level security;
alter table rate_limits enable row level security;

revoke execute on function sweep_legacy_bookings() from public;
revoke execute on function rate_limit_hit(text, integer, integer) from public;
revoke execute on function hold_slot(uuid, timestamptz, timestamptz, text, integer) from public;
revoke execute on function create_request_from_hold(text, text, text, text, timestamptz) from public;
revoke execute on function expire_stale_requests() from public;

-- Supabase grants new functions to anon and authenticated directly, so
-- revoking from public is not enough: only the server (service_role) may call these.
do $$
declare
  v_role text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format('revoke execute on function sweep_legacy_bookings() from %I', v_role);
      execute format('revoke execute on function rate_limit_hit(text, integer, integer) from %I', v_role);
      execute format('revoke execute on function hold_slot(uuid, timestamptz, timestamptz, text, integer) from %I', v_role);
      execute format('revoke execute on function create_request_from_hold(text, text, text, text, timestamptz) from %I', v_role);
      execute format('revoke execute on function expire_stale_requests() from %I', v_role);
    end if;
  end loop;
end;
$$;

-- Dr. Sritha, as on the public site, with the old form's hours:
-- Monday to Saturday, 5:30 to 8:30 PM IST, 30-minute slots.
insert into doctors (slug, display_name, qualification, registration_no, consult_minutes)
values ('sritha', 'Dr. Sritha', 'MBBS, MD (Neuro-Psychiatry)', 'APMC Reg. No. 85598', 30)
on conflict (slug) do nothing;

insert into availability_rules (doctor_id, weekday, start_minute, end_minute, slot_minutes)
select d.id, w.weekday, 17 * 60 + 30, 20 * 60 + 30, 30
from doctors d cross join (values (1), (2), (3), (4), (5), (6)) as w (weekday)
where d.slug = 'sritha'
  and not exists (select 1 from availability_rules r where r.doctor_id = d.id);
