-- Contacts (2026-10-27, Sara: "add a sync contacts option, should ask when
-- clients link their crm, but also need an import option"). The agent's whole
-- book, not tied to a property: brought in from the CRM (when the agent picks
-- "All my contacts" on connecting) or imported from a phone/CSV/vCard file.
-- People on a property stay in `people`; this is the address book.
create table if not exists public.contacts (
  id text primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  name text, phone text, email text, company text,
  kind text,            -- client | lead | sphere | vendor | other
  notes text,
  source text,          -- crm | import | null (typed on the phone)
  owner text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create index if not exists contacts_team on public.contacts (team_id);
alter table public.contacts enable row level security;
drop policy if exists team_rows on public.contacts;
create policy team_rows on public.contacts for all to authenticated
  using (public.bb_is_member(team_id)) with check (public.bb_is_member(team_id));
revoke all on public.contacts from anon;
grant select, insert, update, delete on public.contacts to authenticated;

-- Which contacts the CRM sync brings in: 'deals' (only the people on deals,
-- as before) or 'all' (every contact, into the table above).
alter table public.crm_links add column if not exists contacts_mode text default 'deals';
