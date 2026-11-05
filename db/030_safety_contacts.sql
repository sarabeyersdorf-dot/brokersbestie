-- 030 (2026-11-05): safety contacts must agree before they get alerts.
-- Carriers require that the person RECEIVING texts agreed to them (Twilio
-- toll-free verification). When an agent adds an emergency contact, Bestie
-- texts that contact once; only a YES turns alerts on. STOP opts the number
-- out everywhere. Written only by the reminders function (service role);
-- team members may read their own rows. No unique constraint on purpose:
-- bb_join_team moves every team_id table, and a constraint could make a
-- join fail when two teams added the same person.
create table if not exists public.safety_contacts (
  id bigserial primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  phone text not null,               -- +1XXXXXXXXXX
  name text,
  agent_name text,                   -- who asked, as the contact reads it
  status text not null default 'pending' check (status in ('pending', 'accepted', 'opted_out')),
  invited_at timestamptz,
  invited_by uuid,
  answered_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists safety_contacts_phone on public.safety_contacts (phone);
create index if not exists safety_contacts_team on public.safety_contacts (team_id);
alter table public.safety_contacts enable row level security;
revoke all on public.safety_contacts from anon;
drop policy if exists team_read on public.safety_contacts;
create policy team_read on public.safety_contacts for select to authenticated using (public.bb_is_member(team_id));

-- The alert names the agent ("Jane Smith started a safety check-in…").
alter table public.checkins add column if not exists agent_name text;
