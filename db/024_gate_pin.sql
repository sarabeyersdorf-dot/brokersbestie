-- Gate pin (2026-10-28, phase 9d): the phone's GPS spot at the gate. When set,
-- Directions go to the gate instead of the address.
alter table public.properties add column if not exists gate_lat double precision;
alter table public.properties add column if not exists gate_lng double precision;
