-- Brokers Bestie · team database.
-- Run once in the Supabase SQL editor of the Brokers Bestie project (a NEW
-- project, not Legacy's). Idempotent: safe to run again.
--
-- The model: a person signs in; they belong to one or more teams; every row
-- belongs to a team. Row-level security lets a signed-in member reach their
-- team's rows and nothing else. The browser's anon key cannot read anything
-- without a signed-in member behind it.

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My team',
  created_at timestamptz not null default now()
);

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'agent' check (role in ('owner', 'agent')),
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table if not exists public.team_invites (
  code text primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  created_by uuid references auth.users(id),
  expires_at timestamptz not null default now() + interval '7 days'
);

-- Is the signed-in user on this team? Every policy below asks this.
create or replace function public.bb_is_member(team uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.team_members m where m.team_id = team and m.user_id = auth.uid()) $$;

-- First sign-in: make a team and put the person on it, in one step.
create or replace function public.bb_create_team(team_name text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare t uuid;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  insert into public.teams (name) values (coalesce(nullif(team_name, ''), 'My team')) returning id into t;
  insert into public.team_members (team_id, user_id, role) values (t, auth.uid(), 'owner');
  return t;
end $$;

create or replace function public.bb_invite_code(team uuid)
returns text language plpgsql security definer set search_path = ''
as $$
declare c text;
begin
  if not public.bb_is_member(team) then raise exception 'not on this team'; end if;
  c := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  insert into public.team_invites (code, team_id, created_by) values (c, team, auth.uid());
  return c;
end $$;

create or replace function public.bb_join_team(invite_code text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare t uuid;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select team_id into t from public.team_invites where code = upper(trim(invite_code)) and expires_at > now();
  if t is null then raise exception 'That code is not valid or has expired'; end if;
  insert into public.team_members (team_id, user_id) values (t, auth.uid()) on conflict do nothing;
  return t;
end $$;

-- New functions are runnable by PUBLIC by default; revoking from anon alone
-- leaves that grant in place.
revoke all on function public.bb_create_team(text), public.bb_invite_code(uuid), public.bb_join_team(text) from public, anon;
-- bb_is_member is only for signed-in members' policies; a signed-out visitor
-- has no reason to call it.
revoke all on function public.bb_is_member(uuid) from public, anon;
grant execute on function public.bb_create_team(text), public.bb_invite_code(uuid), public.bb_join_team(text), public.bb_is_member(uuid) to authenticated;

-- ---------- the agent's data ----------
-- ids are made on the phone (it works offline), so they are text, not serial.

create table if not exists public.properties (
  id text primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  address text not null,
  city text, status text, price numeric, mls text, occupancy text,
  well boolean, septic boolean, hoa text, solar text, coe_date date,
  showing_notes text, directions text, disclosure_url text, mls_url text,
  lat double precision, lng double precision,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table if not exists public.access (
  id text primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  property_id text references public.properties(id) on delete cascade,
  kind text, label text, code text, location_note text, status text,
  photo_id text, photo_path text, lat double precision, lng double precision,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table if not exists public.people (
  id text primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  property_id text references public.properties(id) on delete cascade,
  name text, role text, phone text, email text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table if not exists public.notes (
  id text primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  property_id text references public.properties(id) on delete cascade,
  text text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table if not exists public.tasks (
  id text primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  property_id text references public.properties(id) on delete cascade,
  text text, due date, done boolean default false, done_at timestamptz,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table if not exists public.dates (
  id text primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  property_id text references public.properties(id) on delete cascade,
  label text, due date, done boolean default false,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table if not exists public.tours (
  id text primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  name text, date date, start_place text, start_lat double precision, start_lng double precision,
  start_minutes integer, miles numeric, stops jsonb default '[]'::jsonb,
  finished boolean default false, trip_id text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table if not exists public.trips (
  id text primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  property_id text references public.properties(id) on delete set null,
  tour_id text, date date, purpose text, from_place text, to_place text, miles numeric,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table if not exists public.expenses (
  id text primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  property_id text references public.properties(id) on delete set null,
  date date, amount numeric, what text, photo_id text, photo_path text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

-- Safety check-ins. The overdue-alert job reads this with the service key.
create table if not exists public.checkins (
  id text primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid references auth.users(id) default auth.uid(),
  place text, meeting_name text, meeting_phone text,
  contact_name text, contact_phone text, minutes integer,
  status text check (status in ('active', 'ok', 'help')),
  started_at timestamptz, due_at timestamptz, ended_at timestamptz,
  alerted_at timestamptz, lat double precision, lng double precision,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create index if not exists checkins_due on public.checkins (due_at) where status = 'active' and alerted_at is null;

-- ---------- row-level security: your team's rows, nothing else ----------
do $$
declare t text;
begin
  foreach t in array array['properties','access','people','notes','tasks','dates','tours','trips','expenses','checkins'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists team_rows on public.%I', t);
    execute format('create policy team_rows on public.%I for all to authenticated using (public.bb_is_member(team_id)) with check (public.bb_is_member(team_id))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_invites enable row level security;
drop policy if exists team_read on public.teams;
create policy team_read on public.teams for select to authenticated using (public.bb_is_member(id));
drop policy if exists member_read on public.team_members;
create policy member_read on public.team_members for select to authenticated using (user_id = auth.uid() or public.bb_is_member(team_id));
-- Invites are only ever made and redeemed through the functions above.
revoke all on public.teams, public.team_members, public.team_invites from anon;
grant select on public.teams, public.team_members to authenticated;

-- ---------- photos: private bucket, one folder per team ----------
insert into storage.buckets (id, name, public) values ('photos', 'photos', false) on conflict (id) do nothing;
drop policy if exists bb_photos_rw on storage.objects;
create policy bb_photos_rw on storage.objects for all to authenticated
  using (bucket_id = 'photos' and public.bb_is_member(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'photos' and public.bb_is_member(((storage.foldername(name))[1])::uuid));
