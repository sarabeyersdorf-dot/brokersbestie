-- "Leave by" reminders (2026-10-27): where the agent is starting from. The
-- phone sends its last known location (when Bestie already had one, at most
-- every 10 minutes) and the home base from Settings; only for phones that
-- turned reminders on, and only to that phone's own row.
alter table public.push_subs add column if not exists from_lat double precision;
alter table public.push_subs add column if not exists from_lng double precision;
alter table public.push_subs add column if not exists from_at timestamptz;
alter table public.push_subs add column if not exists base_lat double precision;
alter table public.push_subs add column if not exists base_lng double precision;
