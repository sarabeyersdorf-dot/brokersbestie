-- Joining a team is final (2026-10-23). Signing in for the first time made
-- each person a solo team, and joining a second team left them in both, so the
-- phone could open the empty one. Now joining moves anything the person had
-- filed on a team where they were the ONLY member into the team they join,
-- then removes that solo membership. A shared team is never left this way.
create or replace function public.bb_join_team(invite_code text)
returns uuid language plpgsql security definer set search_path = ''
as $$
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
    foreach tbl in array array['properties','access','people','notes','tasks','dates','events','tours','trips','expenses','checkins'] loop
      execute format('update public.%I set team_id = $1 where team_id = $2', tbl) using t, solo;
    end loop;
    delete from public.team_members where team_id = solo and user_id = auth.uid();
  end loop;
  return t;
end $$;
revoke all on function public.bb_join_team(text) from public, anon;
grant execute on function public.bb_join_team(text) to authenticated;
