-- 031 (2026-11-06): Listing Prep, step 1 — the room-by-room walk.
--
-- Sara's Listing Walk-Through and James's Walkthrough spec, combined into one
-- feature (Sara: "combine them into one feature, call it Listing Prep").
--
-- WHO SEES IT is different from the rest of Bestie (Sara, 2026-11-06: "only
-- the broker should see their agents stuff, the rest of the team is their own
-- views"). Every other table is team-shared; these two are not:
--   - an agent sees and changes only their own walks;
--   - the broker (team_members.role = 'owner') sees and changes every agent's;
--   - other agents on the team see nothing.
-- The rule lives here, in the database, so no screen can get it wrong.
--
-- user_id is whoever made the walk (the phone leaves it out and the default
-- fills it). ON DELETE SET NULL: when an agent deletes their account the walk
-- stays with the brokerage, readable by the broker only.
--
-- Photos go in their own private bucket, prep-photos, at
-- <team>/<user>/<photo id>.jpg, under the same rule. They are NOT in the
-- shared photos bucket, whose policy lets any teammate read any file.

create table if not exists public.preps (
  id text primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  owner text,
  property_id text references public.properties(id) on delete cascade,
  unit text,
  property_type text,
  list_price numeric,
  list_date date,
  expiration_date date,
  seller_name text,
  occupant text,
  apn text,
  county text,
  inspected_at timestamptz,
  weather text,
  present text,
  areas jsonb not null default '[]'::jsonb,
  sticky_area text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create index if not exists preps_team on public.preps (team_id);
create index if not exists preps_property on public.preps (property_id);

create table if not exists public.prep_items (
  id text primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  prep_id text not null references public.preps(id) on delete cascade,
  area text,
  category text,
  photo_kind text check (photo_kind is null or photo_kind in ('listing', 'condition')),
  note text,
  follow_up boolean default false,
  photo_id text,
  photo_path text,
  photo_taken_at timestamptz,
  sort integer,
  deleted_at timestamptz,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create index if not exists prep_items_team on public.prep_items (team_id);
create index if not exists prep_items_prep on public.prep_items (prep_id);

-- Is the signed-in user the broker (owner) of this team? A merged solo team
-- (db/028) answers for the team it was merged into.
create or replace function public.bb_is_broker(team uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.team_members m
    where m.user_id = auth.uid() and m.role = 'owner'
      and m.team_id = coalesce((select t.merged_into from public.teams t where t.id = team), team)
  )
$$;
revoke all on function public.bb_is_broker(uuid) from public, anon;
grant execute on function public.bb_is_broker(uuid) to authenticated;

-- A walk row: the agent who made it, or the team's broker.
create or replace function public.bb_prep_visible(team uuid, maker uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.bb_is_member(team) and (maker = auth.uid() or public.bb_is_broker(team))
$$;
revoke all on function public.bb_prep_visible(uuid, uuid) from public, anon;
grant execute on function public.bb_prep_visible(uuid, uuid) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['preps', 'prep_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists prep_read on public.%I', t);
    execute format('drop policy if exists prep_insert on public.%I', t);
    execute format('drop policy if exists prep_update on public.%I', t);
    execute format('drop policy if exists prep_delete on public.%I', t);
    execute format('create policy prep_read on public.%I for select to authenticated using (public.bb_prep_visible(team_id, user_id))', t);
    -- A new row is the signed-in person's own (or, for the broker, a change
    -- arriving as an upsert of an agent's row).
    execute format('create policy prep_insert on public.%I for insert to authenticated with check (public.bb_can_write(team_id) and (user_id = auth.uid() or public.bb_is_broker(team_id)))', t);
    execute format('create policy prep_update on public.%I for update to authenticated using (public.bb_prep_visible(team_id, user_id) and public.bb_can_write(team_id)) with check (public.bb_prep_visible(team_id, user_id) and public.bb_can_write(team_id))', t);
    execute format('create policy prep_delete on public.%I for delete to authenticated using (public.bb_prep_visible(team_id, user_id) and public.bb_can_write(team_id))', t);
  end loop;
end $$;

-- ---------- prep-photos: private bucket, <team>/<user>/<file> ----------
insert into storage.buckets (id, name, public) values ('prep-photos', 'prep-photos', false) on conflict (id) do nothing;

create or replace function public.bb_prep_files(team_folder text, user_folder text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case when team_folder ~ '^[0-9a-f-]{36}$' then
    public.bb_can_files(team_folder)
    and (user_folder = auth.uid()::text or public.bb_is_broker(team_folder::uuid))
  else false end
$$;
revoke all on function public.bb_prep_files(text, text) from public, anon;
grant execute on function public.bb_prep_files(text, text) to authenticated;

drop policy if exists bb_prep_photos_read on storage.objects;
create policy bb_prep_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'prep-photos' and public.bb_prep_files((storage.foldername(name))[1], (storage.foldername(name))[2]));
-- Uploads only into your own folder of your own team.
drop policy if exists bb_prep_photos_write on storage.objects;
create policy bb_prep_photos_write on storage.objects for insert to authenticated
  with check (bucket_id = 'prep-photos' and public.bb_is_member(((storage.foldername(name))[1])::uuid)
    and (storage.foldername(name))[2] = auth.uid()::text);
drop policy if exists bb_prep_photos_update on storage.objects;
create policy bb_prep_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'prep-photos' and (storage.foldername(name))[2] = auth.uid()::text and public.bb_is_member(((storage.foldername(name))[1])::uuid));
drop policy if exists bb_prep_photos_delete on storage.objects;
create policy bb_prep_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'prep-photos' and public.bb_prep_files((storage.foldername(name))[1], (storage.foldername(name))[2]));
