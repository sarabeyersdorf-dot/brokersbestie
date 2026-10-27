-- 24-hour code links (2026-10-27): send an assistant, photographer or
-- inspector one property's codes and directions by a link that stops working
-- the next day (or when the agent taps "Stop links"). Read only through the
-- `reminders` Edge Function (op=share), never by anon directly.
create table if not exists public.share_links (
  token text primary key default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  team_id uuid not null references public.teams(id) on delete cascade,
  property_id text not null references public.properties(id) on delete cascade,
  owner text, revoked boolean default false,
  created_at timestamptz default now(),
  expires_at timestamptz default now() + interval '24 hours'
);
alter table public.share_links enable row level security;
create policy team_rows on public.share_links for all to authenticated
  using (public.bb_is_member(team_id)) with check (public.bb_is_member(team_id));
revoke all on public.share_links from anon;
grant select, insert, update, delete on public.share_links to authenticated;
