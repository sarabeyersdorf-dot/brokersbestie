-- Billing (2026-10-28). Sara: per agent, one bill for the team; read-only when
-- a trial ends or payment stops. Stripe is the record of payment; this table
-- is its mirror, written ONLY by the webhook (service role). Team members may
-- read their own team's row.
create table if not exists public.billing (
  team_id uuid primary key references public.teams(id) on delete cascade,
  stripe_customer_id text, stripe_subscription_id text, stripe_item_id text,
  plan text,                 -- Stripe price lookup key
  status text,               -- Stripe subscription status
  seats integer,
  trial_ends_at timestamptz, -- set when a plan is chosen; else created_at + 14 days
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  comped boolean default false,
  updated_at timestamptz default now()
);
create index if not exists billing_customer on public.billing (stripe_customer_id);
alter table public.billing enable row level security;
drop policy if exists billing_read on public.billing;
create policy billing_read on public.billing for select to authenticated using (public.bb_is_member(team_id));
revoke all on public.billing from anon;
revoke insert, update, delete on public.billing from authenticated;
grant select on public.billing to authenticated;

-- Server-wide switches. OFF until launch: nothing is locked until Sara says so.
create table if not exists public.bb_config (key text primary key, value text);
alter table public.bb_config enable row level security;
revoke all on public.bb_config from anon, authenticated;
insert into public.bb_config (key, value) values ('billing_enforced', 'false') on conflict (key) do nothing;

-- Sara and James's own team never pays.
insert into public.billing (team_id, comped) values ('23e837a2-d13a-4cf2-a22f-0dc9de042025', true)
  on conflict (team_id) do update set comped = true;

-- May this signed-in user change this team's data? Same rule as entitlement()
-- in js/billing.js. Member AND (billing not enforced, or comped, or a paying /
-- trialing / past-due plan, or still inside the free trial).
create or replace function public.bb_can_write(team uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.bb_is_member(team) and (
    coalesce((select value from public.bb_config where key = 'billing_enforced'), 'false') <> 'true'
    or exists (select 1 from public.billing b where b.team_id = team and (b.comped or b.status in ('trialing', 'active', 'past_due')))
    or coalesce((select b.trial_ends_at from public.billing b where b.team_id = team),
                (select t.created_at + interval '14 days' from public.teams t where t.id = team)) > now()
  )
$$;
revoke execute on function public.bb_can_write(uuid) from public, anon;
grant execute on function public.bb_can_write(uuid) to authenticated;

-- Read for every member always; write only while the team can write.
-- Safety check-ins (checkins) and reminders (push_subs) are left as they are:
-- a lapsed plan must never stop a safety alert.
do $$
declare t text;
begin
  foreach t in array array['properties','access','people','notes','tasks','dates','events','tours','trips','expenses','profiles','visitors','vendors','contacts','oh_links','share_links'] loop
    execute format('drop policy if exists team_rows on public.%I', t);
    execute format('drop policy if exists team_read on public.%I', t);
    execute format('drop policy if exists team_insert on public.%I', t);
    execute format('drop policy if exists team_update on public.%I', t);
    execute format('drop policy if exists team_delete on public.%I', t);
    execute format('create policy team_read on public.%I for select to authenticated using (public.bb_is_member(team_id))', t);
    execute format('create policy team_insert on public.%I for insert to authenticated with check (public.bb_can_write(team_id))', t);
    execute format('create policy team_update on public.%I for update to authenticated using (public.bb_can_write(team_id)) with check (public.bb_can_write(team_id))', t);
    execute format('create policy team_delete on public.%I for delete to authenticated using (public.bb_can_write(team_id))', t);
  end loop;
end $$;
