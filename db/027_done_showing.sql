-- 027: "Done with this home" (James, 2026-10-31: "Rough and Ready was a
-- showing to Brian Duarte. He is not interested in that property. What do I do
-- now with this property on the app?"). Another agent's home you showed gets
-- the status 'shown' (Done showing): off the active list, its code and notes
-- kept, and who saw it and how they felt kept here, so it still appears on
-- that buyer's page even when it was never on a Bestie tour.
alter table public.properties add column if not exists shown_buyer text;
alter table public.properties add column if not exists shown_reaction text;
alter table public.properties add column if not exists shown_note text;
alter table public.properties add column if not exists shown_at timestamptz;
