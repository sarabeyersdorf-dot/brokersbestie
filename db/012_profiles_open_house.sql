-- Agent profile & branding, and open house sign-ins (2026-10-27, Sara: "build
-- the open house sign-in and make sure that users can add their own branding,
-- brokerage, license #'s when they set up").
-- profiles: one per agent (owner = their first name key, as elsewhere). The
-- logo and headshot live in the team's private photos bucket by id.
create table if not exists public.profiles (
  id text primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  owner text, full_name text, title text, phone text, email text, license text,
  brokerage text, brokerage_license text, brokerage_phone text, website text,
  color text, logo_id text, logo_path text, headshot_id text, headshot_path text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
-- visitors: who signed in at an open house. consent = they ticked "may contact
-- me"; followed_up_at = the agent sent the thank-you.
create table if not exists public.visitors (
  id text primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  property_id text references public.properties(id) on delete set null,
  owner text, oh_date date, first_name text, last_name text, phone text, email text,
  has_agent boolean, agent_name text, timeframe text, also_selling boolean,
  consent boolean default false, notes text, followed_up_at timestamptz,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create index if not exists visitors_property on public.visitors (property_id);
do $$
declare t text;
begin
  foreach t in array array['profiles','visitors'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists team_rows on public.%I', t);
    execute format('create policy team_rows on public.%I for all to authenticated using (public.bb_is_member(team_id)) with check (public.bb_is_member(team_id))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
