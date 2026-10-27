-- Feedback from agents who show MY listings (2026-10-27): who showed it, and
-- when the agent asked for and logged their feedback. The logged words go to
-- the property as a "Showing feedback" note, so the weekly seller update has them.
alter table public.events add column if not exists showing_agent text;
alter table public.events add column if not exists showing_agent_phone text;
alter table public.events add column if not exists feedback_asked_at timestamptz;
alter table public.events add column if not exists feedback_logged_at timestamptz;
