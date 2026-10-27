-- Which kind of CRM a team connected (2026-10-27, Sara: "can we add follow up
-- boss or add your crm api key?"). 'feed' = a Bestie Feed v1 link (Legacy);
-- 'fub' = Follow Up Boss, where feed_key holds the agent's FUB API key.
-- tz = the agent's time zone, so FUB's UTC appointment times land on the
-- right day and hour. Server-only table: RLS on, no policies (db/003).
alter table public.crm_links add column if not exists provider text default 'feed';
alter table public.crm_links add column if not exists tz text;
