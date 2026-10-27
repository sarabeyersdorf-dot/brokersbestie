-- Pop-up reminders (2026-10-27). Supabase sends them: pg_cron calls the
-- `reminders` Edge Function every 5 minutes (Vercel's free plan runs a cron
-- once a day). The VAPID keys are made by that function on its first run and
-- kept in push_config, which no phone can read: nothing for anyone to paste.

-- One row per phone that turned reminders on.
create table if not exists public.push_subs (
  id text primary key,                       -- a hash of the endpoint
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade default auth.uid(),
  owner text, endpoint text not null, p256dh text not null, auth text not null,
  tz text, lead_minutes integer default 30,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
alter table public.push_subs enable row level security;
drop policy if exists own_subs on public.push_subs;
create policy own_subs on public.push_subs for all to authenticated
  using (user_id = auth.uid() and public.bb_is_member(team_id))
  with check (user_id = auth.uid() and public.bb_is_member(team_id));
revoke all on public.push_subs from anon;
grant select, insert, update, delete on public.push_subs to authenticated;

-- What has been sent (so nothing is sent twice) and the keys. Server only.
create table if not exists public.push_sent (key text primary key, sent_at timestamptz default now());
create table if not exists public.push_config (
  id integer primary key default 1 check (id = 1),
  public_key text, private_jwk jsonb,
  cron_token text not null default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
);
alter table public.push_sent enable row level security;
alter table public.push_config enable row level security;
revoke all on public.push_sent, public.push_config from anon, authenticated;
insert into public.push_config (id) values (1) on conflict (id) do nothing;

create extension if not exists pg_net;
create extension if not exists pg_cron;
select cron.schedule('bestie-reminders', '*/5 * * * *', $job$
  select net.http_post(
    url := 'https://bycsdukxwzkahaxnkmgb.supabase.co/functions/v1/reminders',
    headers := jsonb_build_object('content-type', 'application/json',
      'x-cron-token', (select cron_token from public.push_config where id = 1)),
    body := '{"op":"run"}'::jsonb)
$job$);
