-- Two-way CRM sync (2026-10-23). crm_dirty: changed on a phone, not yet sent
-- to the CRM. The phone sets it (store.save) on a CRM-linked deadline or
-- appointment; the server clears it once the CRM accepts the change. A CRM
-- pull never overwrites a row while it is still dirty.
-- cancelled: an appointment deleted on the phone that the CRM must delete too;
-- hidden everywhere, removed once the CRM has done it.
alter table public.dates add column if not exists crm_dirty boolean default false;
alter table public.events add column if not exists crm_dirty boolean default false;
alter table public.events add column if not exists cancelled boolean default false;
