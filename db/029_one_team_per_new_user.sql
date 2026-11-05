-- 029 (2026-10-31): a new account could get TWO teams. The phone asks for
-- its team from two places at once on first sign-in (startCloud and the
-- sign-in event both call syncNow), each found no team yet, and each called
-- bb_create_team. Seen on the second sandbox test account: Delete my account
-- removed one team and left an empty, memberless one behind.
-- Now bb_create_team takes a per-person lock and hands back the team the
-- person already has, so two calls at once make one team.
create or replace function public.bb_create_team(team_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare t uuid;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  perform pg_advisory_xact_lock(hashtext('bb_create_team:' || auth.uid()::text));
  select m.team_id into t from public.team_members m where m.user_id = auth.uid() order by m.created_at limit 1;
  if t is not null then return t; end if;
  insert into public.teams (name) values (coalesce(nullif(team_name, ''), 'My team')) returning id into t;
  insert into public.team_members (team_id, user_id, role) values (t, auth.uid(), 'owner');
  return t;
end $$;
revoke all on function public.bb_create_team(text) from public, anon;
grant execute on function public.bb_create_team(text) to authenticated;
