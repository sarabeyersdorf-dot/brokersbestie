-- Who a tour is for (2026-10-24, Sara: "add the faces to the buyer record").
-- A buyer's page in Bestie gathers every home they saw and their reaction.
-- Plain name, not a link to people: people belong to properties, and a buyer
-- is someone you drive around, not a contact on a listing.
alter table public.tours add column if not exists buyer text;
