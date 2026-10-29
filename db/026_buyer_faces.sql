-- Buyer taps their own faces (2026-10-29): the agent texts the buyer a link
-- (faces.html?t=) to today's tour; the buyer picks a face for each home on
-- their own phone. Read and written only through the `reminders` Edge
-- Function (op=tour / op=face); the phone reads tour_faces to show them.
-- No codes, notes or agent details beyond the agent's name and phone go out.
create table if not exists public.tour_links (
  token text primary key default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  team_id uuid not null references public.teams(id) on delete cascade,
  tour_id text not null references public.tours(id) on delete cascade,
  owner text, revoked boolean default false,
  created_at timestamptz default now(),
  expires_at timestamptz default now() + interval '3 days'
);
alter table public.tour_links enable row level security;
create policy team_rows on public.tour_links for all to authenticated
  using (public.bb_is_member(team_id)) with check (public.bb_is_member(team_id));
revoke all on public.tour_links from anon;
grant select, insert, update, delete on public.tour_links to authenticated;

-- One row per home the buyer rated; the function upserts it (service role).
create table if not exists public.tour_faces (
  id text primary key, -- tour_id || '/' || stop_id
  team_id uuid not null references public.teams(id) on delete cascade,
  tour_id text not null references public.tours(id) on delete cascade,
  stop_id text not null,
  reaction text not null,
  note text,
  updated_at timestamptz default now()
);
alter table public.tour_faces enable row level security;
create policy team_read on public.tour_faces for select to authenticated using (public.bb_is_member(team_id));
revoke all on public.tour_faces from anon;
grant select on public.tour_faces to authenticated;
create index if not exists tour_faces_tour on public.tour_faces (tour_id);
