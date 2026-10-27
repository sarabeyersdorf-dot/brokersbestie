-- The weekly seller update (2026-10-27). Date listed (days on market), the
-- seller's portal link and the online numbers come from the CRM when it has
-- them (Legacy does); the agent can type the first two. seller_update_at is
-- stamped when the agent sends one, for the weekly reminder on Today.
alter table public.properties add column if not exists list_date date;
alter table public.properties add column if not exists portal_url text;
alter table public.properties add column if not exists marketing jsonb;
alter table public.properties add column if not exists seller_update_at timestamptz;
