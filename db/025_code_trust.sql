-- Code last worked (2026-10-29): "worked for James 3 days ago" or "reported
-- not working" on each saved code, so a team can trust a shared code.
alter table public.access add column if not exists worked_at timestamptz;
alter table public.access add column if not exists worked_by text;
alter table public.access add column if not exists failed_at timestamptz;
alter table public.access add column if not exists failed_by text;
