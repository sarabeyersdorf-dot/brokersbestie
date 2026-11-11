-- 032 (2026-11-11): the Google Play reviewer account.
--
-- Google Play's reviewers need a way past sign-in, and they cannot receive the
-- emailed code. So one account (playreview@brokersbestie.app) can sign in with
-- a password. It has its own team, never Legacy's, comped like Sara and
-- James's, and that team can never send a text.
--
-- 1. teams.sms_blocked: the reminders function refuses every text for a team
--    with this set (cappedText, the one door every text goes through). A
--    reviewer pressing "Send help now" texts nobody.
-- 2. review_seed: the demo story (js/sample.js, ids review-*), one row per
--    table, written for base_date. Server only (RLS on, no policies).
-- 3. bb_reset_review_team(): wipes the review team's rows and puts the demo
--    story back, every date moved forward to today. Run once now and every
--    night by pg_cron, so a reviewer always finds today's tour, not last
--    week's, and whatever the last reviewer changed is gone.
--
-- Which team and which user are in bb_config ('review_team', 'review_user'),
-- set when the account was made. The account itself, its password and the
-- team are data, not schema, and are not in this file.

alter table public.teams add column if not exists sms_blocked boolean not null default false;

create table if not exists public.review_seed (
  tbl text primary key,
  ord integer not null,
  rows jsonb not null default '[]'::jsonb,
  base_date date not null
);
alter table public.review_seed enable row level security;
revoke all on public.review_seed from anon, authenticated;

create or replace function public.bb_reset_review_team()
returns text language plpgsql security definer set search_path = '' as $$
declare
  team uuid := (select value::uuid from public.bb_config where key = 'review_team');
  uid uuid := (select value::uuid from public.bb_config where key = 'review_user');
  today date := (now() at time zone 'America/Los_Angeles')::date;
  s record; r jsonb; k text; batch jsonb; shift integer; n integer := 0;
  date_keys text[] := array['list_date', 'coe_date', 'due', 'date', 'oh_date', 'expiration_date'];
  extra text[] := array['checkins', 'safety_contacts', 'oh_links', 'share_links', 'tour_links', 'tour_faces', 'expenses', 'tasks'];
begin
  if team is null or uid is null then return 'no review team set'; end if;
  -- Safety: never touch a team with anyone in it but the review user.
  if exists (select 1 from public.team_members m where m.team_id = team and m.user_id <> uid) then
    return 'review team has other members; not reset';
  end if;
  -- Clear what a reviewer may have added, then the seeded tables, children first.
  foreach k in array extra loop
    execute format('delete from public.%I where team_id = $1', k) using team;
  end loop;
  for s in select * from public.review_seed order by ord desc loop
    execute format('delete from public.%I where team_id = $1', s.tbl) using team;
  end loop;
  for s in select * from public.review_seed order by ord loop
    shift := today - s.base_date;
    batch := '[]'::jsonb;
    for r in select * from jsonb_array_elements(s.rows) loop
      foreach k in array date_keys loop
        if r ? k and jsonb_typeof(r -> k) = 'string' then
          r := jsonb_set(r, array[k], to_jsonb(((r ->> k)::date + shift)::text));
        end if;
      end loop;
      r := jsonb_build_object('created_at', now()) || r || jsonb_build_object('team_id', team, 'updated_at', now());
      if s.tbl in ('preps', 'prep_items') then r := r || jsonb_build_object('user_id', uid); end if;
      batch := batch || jsonb_build_array(r);
    end loop;
    execute format('insert into public.%1$I select * from jsonb_populate_recordset(null::public.%1$I, $1)', s.tbl) using batch;
    n := n + jsonb_array_length(batch);
  end loop;
  update public.teams set sms_blocked = true where id = team;
  return format('reset %s rows for %s', n, today);
end $$;
revoke all on function public.bb_reset_review_team() from public, anon, authenticated;

-- Every night at 3:10 AM Pacific (11:10 UTC; 10:10 in summer time is fine too).
select cron.unschedule('bestie-review-reset') where exists (select 1 from cron.job where jobname = 'bestie-review-reset');
select cron.schedule('bestie-review-reset', '10 11 * * *', $job$select public.bb_reset_review_team()$job$);
