-- What a connected CRM actually sends, as FIELD NAMES only (never values), so
-- a connector built without full API docs (kvCORE, Lofty) can be checked and
-- corrected after an agent's first sync. Server-only table (db/003).
alter table public.crm_links add column if not exists last_shape text;
