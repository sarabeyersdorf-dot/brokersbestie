-- Whose is it (2026-10-24, Sara: "James joined, add the Mine / James filter").
-- owner = a person's first name, lower case ("sara", "james"); "both" or empty
-- means the whole team. Set by the phone on anything new (store.save, from
-- Settings -> Your first name) and by the CRM sync from its agent field.
alter table public.properties add column if not exists owner text;
alter table public.events add column if not exists owner text;
alter table public.tasks add column if not exists owner text;
alter table public.tours add column if not exists owner text;
