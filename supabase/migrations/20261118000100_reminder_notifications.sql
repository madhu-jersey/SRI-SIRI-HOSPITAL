-- Reminder notifications: remembers which reminder (Zoom link, confirmation,
-- feedback) has already been sent to staff devices at which stage (due or
-- overdue), so the every-minute check notifies each one only once.
-- Run after 20261117000100_calendar_control.sql.

create table reminder_pushes (
  consultation_id uuid not null references consultations (id) on delete cascade,
  kind text not null check (kind in ('confirmation', 'link', 'feedback')),
  stage text not null check (stage in ('due', 'overdue')),
  sent_at timestamptz not null default now(),
  primary key (consultation_id, kind, stage)
);
alter table reminder_pushes enable row level security;

-- The every-minute schedule itself is set up separately (it contains the
-- server's secret): see the local file supabase/local/schedule-reminders.sql.
