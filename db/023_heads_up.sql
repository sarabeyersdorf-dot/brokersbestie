-- Heads-up tags on a property (2026-10-28, phase 9c): Dog, Cattle guard,
-- Livestock, Low branches, Steep drive, No turnaround, Well head, Septic lid,
-- Alarm. "Occupied" is the existing occupancy column, not a tag.
alter table public.properties add column if not exists heads_up text[] not null default '{}';
