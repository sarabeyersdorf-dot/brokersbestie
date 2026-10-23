-- MLS sheets and other files kept with a note (2026-10-23).
-- files: [{ id, type, path }] — the pages live in the photos bucket at
-- <team_id>/<id>.jpg or .pdf, under the same team-only storage policy.
-- source: 'mls_sheet' for a note made from a sheet, else null.
alter table public.notes add column if not exists source text;
alter table public.notes add column if not exists files jsonb default '[]'::jsonb;
