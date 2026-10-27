-- Where a buyer's tour recap goes (2026-10-27, Sara: "send the buyer their
-- tour recap"). Typed once in the recap sheet, kept on the tour.
alter table public.tours add column if not exists buyer_phone text;
alter table public.tours add column if not exists buyer_email text;
alter table public.tours add column if not exists recap_sent_at timestamptz;
