-- Open house sign-ins go to the CRM (Sara, 2026-11-06: "I have an open house
-- sign in in brokers bestie already"). Each visitor who ticked "may contact
-- me" at an open house on a CRM listing is sent once by the CRM sync
-- (pushChanges in api/_lib/feed.js, type 'visitor'); the server stamps
-- crm_sent_at when the CRM accepts it, and crm_ext with the CRM's contact id.
-- Written by the server only; the phone never sends these columns.
alter table public.visitors add column if not exists crm_sent_at timestamptz;
alter table public.visitors add column if not exists crm_ext text;
