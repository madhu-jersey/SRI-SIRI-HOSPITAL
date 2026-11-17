-- Doctor's calendar control: time off (blocked dates and hours) and editable
-- weekly clinic hours. Run after 20261116000100_whatsapp_consultations.sql.

create table time_off (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references doctors (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null default '' check (length(reason) <= 200),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index time_off_doctor_range on time_off (doctor_id, starts_at, ends_at);
alter table time_off enable row level security;

-- Replace a doctor's weekly hours in one step, so patients never see a
-- half-saved week.
create function replace_availability(p_doctor uuid, p_rules jsonb) returns integer language plpgsql as $$
begin
  delete from availability_rules where doctor_id = p_doctor;
  insert into availability_rules (doctor_id, weekday, start_minute, end_minute, slot_minutes)
  select p_doctor, (r ->> 'weekday')::smallint, (r ->> 'start_minute')::integer, (r ->> 'end_minute')::integer, (r ->> 'slot_minutes')::integer
  from jsonb_array_elements(p_rules) as r;
  return (select count(*) from availability_rules where doctor_id = p_doctor);
end;
$$;

revoke execute on function replace_availability(uuid, jsonb) from public;
do $$
declare
  v_role text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format('revoke execute on function replace_availability(uuid, jsonb) from %I', v_role);
    end if;
  end loop;
end;
$$;
