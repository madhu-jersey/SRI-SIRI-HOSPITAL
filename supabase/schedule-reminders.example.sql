-- Every minute, ask the site to notify staff phones about WhatsApp reminders
-- that are due (Zoom link 30 minutes before, feedback after, overdue ones).
-- Run in the Supabase SQL editor after the migrations. Replace
-- <REMINDERS_SECRET> with the value from .env.local / Vercel. A ready copy
-- with the real value is generated at supabase/local/schedule-reminders.sql
-- (git ignores that folder). Safe to run again: it replaces the old schedule.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid) from cron.job where jobname = 'sri-siri-reminders';

select cron.schedule(
  'sri-siri-reminders',
  '* * * * *',
  $job$
    select net.http_get(
      url := 'https://sri-siri-hospital-5nct-pink.vercel.app/api/app?route=cron/reminders',
      headers := jsonb_build_object('Authorization', 'Bearer <REMINDERS_SECRET>'),
      timeout_milliseconds := 15000
    );
  $job$
);

-- To check it runs:   select * from cron.job_run_details order by start_time desc limit 5;
-- To stop it:         select cron.unschedule('sri-siri-reminders');
