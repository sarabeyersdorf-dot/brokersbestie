-- A daily limit on the paid AI features (2026-10-28): reading MLS sheets,
-- Tell Bestie and reading showing confirmations each cost money per use, and
-- anyone who signs up can use them. One row per agent per Pacific day.
-- Server only: RLS on with no policies, and only the service role may call
-- bb_ai_take.
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  uses integer not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;

-- Counts one use and returns the new total, or null when today's cap is
-- already reached (nothing is counted then). One statement, so two requests
-- at once cannot both slip past the cap.
create or replace function public.bb_ai_take(who uuid, cap integer)
returns integer language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  if cap < 1 then return null; end if;
  insert into public.ai_usage as u (user_id, day, uses)
  values (who, (now() at time zone 'America/Los_Angeles')::date, 1)
  on conflict (user_id, day) do update set uses = u.uses + 1 where u.uses < cap
  returning uses into n;
  return n;
end $$;
revoke execute on function public.bb_ai_take(uuid, integer) from public, anon, authenticated;
grant execute on function public.bb_ai_take(uuid, integer) to service_role;
