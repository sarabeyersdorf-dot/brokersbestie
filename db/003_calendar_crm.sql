-- Calendar events, the phone-calendar feed, and the CRM connection (2026-10-23).

-- Appointments: showings, walk-throughs, inspections, closings, meetings.
-- date + start_minutes are the agent's wall-clock time; start_minutes null = all day.
-- source = 'crm' for rows the CRM sync writes (it may update or remove them).
create table if not exists public.events (
  id text primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  property_id text references public.properties(id) on delete set null,
  title text, kind text, date date, start_minutes integer, minutes integer,
  location text, notes text, done boolean default false, source text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
alter table public.events enable row level security;
drop policy if exists team_rows on public.events;
create policy team_rows on public.events for all to authenticated
  using (public.bb_is_member(team_id)) with check (public.bb_is_member(team_id));
revoke all on public.events from anon;
grant select, insert, update, delete on public.events to authenticated;

alter table public.properties add column if not exists source text;
alter table public.people add column if not exists source text;
alter table public.dates add column if not exists source text;

-- One CRM feed per team. Read and written ONLY by the server (service role):
-- RLS on with no policies, so the key never reaches a phone.
create table if not exists public.crm_links (
  team_id uuid primary key references public.teams(id) on delete cascade,
  feed_url text, feed_key text,
  last_synced_at timestamptz, last_result text,
  updated_at timestamptz default now()
);
alter table public.crm_links enable row level security;
revoke all on public.crm_links from anon, authenticated;

-- The secret link a phone calendar subscribes to. Server-only, like crm_links.
create table if not exists public.cal_feeds (
  token text primary key default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  team_id uuid not null unique references public.teams(id) on delete cascade,
  created_at timestamptz default now()
);
alter table public.cal_feeds enable row level security;
revoke all on public.cal_feeds from anon, authenticated;

create or replace function public.bb_cal_token(team uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare t text;
begin
  if not public.bb_is_member(team) then raise exception 'not on this team'; end if;
  insert into public.cal_feeds (team_id) values (team) on conflict (team_id) do nothing;
  select token into t from public.cal_feeds where team_id = team;
  return t;
end $$;
revoke all on function public.bb_cal_token(uuid) from public, anon;
grant execute on function public.bb_cal_token(uuid) to authenticated;
