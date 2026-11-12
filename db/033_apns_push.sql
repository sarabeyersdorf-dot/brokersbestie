-- 033 (2026-11-12): reminders on the iPhone App Store app.
--
-- Web push does not work inside an App Store app's web view, so the native
-- iPhone app (James's, bundle app.brokersbestie) hands the page an Apple push
-- token and the page saves it here. kind 'apns' rows carry apns_token +
-- apns_env ('sandbox' for TestFlight/debug builds, 'production' otherwise)
-- and no web endpoint/keys; the reminders function sends those to Apple
-- (APNs) and every other row by web push, exactly as before.
alter table public.push_subs add column if not exists kind text not null default 'web';
alter table public.push_subs add column if not exists apns_token text;
alter table public.push_subs add column if not exists apns_env text;
alter table public.push_subs alter column endpoint drop not null;
alter table public.push_subs alter column p256dh drop not null;
alter table public.push_subs alter column auth drop not null;
alter table public.push_subs drop constraint if exists push_subs_kind_ok;
alter table public.push_subs add constraint push_subs_kind_ok check (
  (kind = 'web' and endpoint is not null and p256dh is not null and auth is not null)
  or (kind = 'apns' and apns_token is not null and apns_env in ('sandbox', 'production'))
);
