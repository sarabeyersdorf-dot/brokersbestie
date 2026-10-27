-- Vendor list (2026-10-27): the agent's go-to inspector, title rep, lender,
-- stager, handyman..., saved once and added to any property in one tap.
create table if not exists public.vendors (
  id text primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  name text, company text, trade text, phone text, email text, notes text,
  favorite boolean default false, owner text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
alter table public.vendors enable row level security;
create policy team_rows on public.vendors for all to authenticated
  using (public.bb_is_member(team_id)) with check (public.bb_is_member(team_id));
revoke all on public.vendors from anon;
grant select, insert, update, delete on public.vendors to authenticated;
