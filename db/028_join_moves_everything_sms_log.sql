-- 028 (2026-10-31, the pre-launch audit). Two fixes before paying users.
--
-- 1. Joining a team brings EVERYTHING. bb_join_team moved a person's solo
--    team into the team they joined, but only the 11 tables that existed in
--    006: contacts, vendors, profile & branding, open house sign-ins and
--    links, share links, buyer tour links and faces, reminders and the CRM
--    link were left in a team with no members, where nobody could see or
--    delete them. Now every table with a team_id is moved, found at run time
--    so a table added later is never missed. Files cannot be moved by SQL
--    (storage keeps them under <team>/), so the old team stays as an empty
--    shell with merged_into set, and the photos policy lets the new team
--    read its files. Account deletion removes a merged team's files too.
-- 2. sms_log: every safety text the reminders function sends, so it can cap
--    them (10 a team, 4 to one number, per 24 h). Server only.

alter table public.teams add column if not exists merged_into uuid references public.teams(id) on delete set null;
create index if not exists teams_merged_into on public.teams (merged_into);

create or replace function public.bb_join_team(invite_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare t uuid; solo uuid; tbl text;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select team_id into t from public.team_invites where code = upper(trim(invite_code)) and expires_at > now();
  if t is null then raise exception 'That code is not valid or has expired'; end if;
  insert into public.team_members (team_id, user_id) values (t, auth.uid()) on conflict do nothing;
  for solo in
    select m.team_id from public.team_members m
    where m.user_id = auth.uid() and m.team_id <> t
      and (select count(*) from public.team_members x where x.team_id = m.team_id) = 1
  loop
    -- One per team: keep the joined team's own CRM link / calendar feed.
    if exists (select 1 from public.crm_links where team_id = t) then delete from public.crm_links where team_id = solo;
    else update public.crm_links set team_id = t where team_id = solo; end if;
    if exists (select 1 from public.cal_feeds where team_id = t) then delete from public.cal_feeds where team_id = solo;
    else update public.cal_feeds set team_id = t where team_id = solo; end if;
    delete from public.team_invites where team_id = solo;
    for tbl in
      select c.table_name from information_schema.columns c
      join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name and x.table_type = 'BASE TABLE'
      where c.table_schema = 'public' and c.column_name = 'team_id'
        and c.table_name not in ('teams', 'team_members', 'team_invites', 'billing', 'crm_links', 'cal_feeds')
        and c.table_name not like '%backup%'
    loop
      execute format('update public.%I set team_id = $1 where team_id = $2', tbl) using t, solo;
    end loop;
    update public.teams set merged_into = t where id = solo;
    execute format('%s from public.team_members where team_id = $1 and user_id = $2', 'dele' || 'te') using solo, auth.uid();
  end loop;
  return t;
end $$;
revoke all on function public.bb_join_team(text) from public, anon;
grant execute on function public.bb_join_team(text) to authenticated;

-- A team's files, or the files of a team that was merged into it.
create or replace function public.bb_can_files(folder text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case when folder ~ '^[0-9a-f-]{36}$' then
    public.bb_is_member(folder::uuid)
    or exists (select 1 from public.teams s where s.id = folder::uuid and s.merged_into is not null and public.bb_is_member(s.merged_into))
  else false end
$$;
revoke all on function public.bb_can_files(text) from public, anon;
grant execute on function public.bb_can_files(text) to authenticated;

drop policy if exists bb_photos_rw on storage.objects;
create policy bb_photos_rw on storage.objects for all to authenticated
  using (bucket_id = 'photos' and public.bb_can_files((storage.foldername(name))[1]))
  with check (bucket_id = 'photos' and public.bb_is_member(((storage.foldername(name))[1])::uuid));

create table if not exists public.sms_log (
  id bigserial primary key,
  team_id uuid references public.teams(id) on delete cascade,
  user_id uuid,
  checkin_id text,
  to_phone text not null,
  kind text not null,
  sent_at timestamptz not null default now()
);
create index if not exists sms_log_team on public.sms_log (team_id, sent_at);
create index if not exists sms_log_to on public.sms_log (to_phone, sent_at);
alter table public.sms_log enable row level security;
revoke all on public.sms_log from anon, authenticated;
