-- 2026-10-27. Open house sign-in on the visitor's own phone: the agent's
-- phone makes a link (QR code) for one property; anyone with it can add a
-- visitor to that open house through the `reminders` Edge Function, which
-- checks the link and writes the row. The link stops working after 3 days.
create table if not exists public.oh_links (
  token text primary key default replace(gen_random_uuid()::text, '-', ''),
  team_id uuid not null references public.teams(id) on delete cascade,
  property_id text references public.properties(id) on delete cascade,
  owner text,
  created_at timestamptz default now(),
  expires_at timestamptz default now() + interval '3 days'
);
alter table public.oh_links enable row level security;
create policy team_rows on public.oh_links for all to authenticated
  using (public.bb_is_member(team_id)) with check (public.bb_is_member(team_id));
revoke all on public.oh_links from anon;
grant select, insert, update, delete on public.oh_links to authenticated;
