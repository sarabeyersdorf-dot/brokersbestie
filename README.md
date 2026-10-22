# Brokers Bestie

Everything a real estate agent needs at the door, on their phone: gate, alarm and
lockbox codes; where the sign, Supra and septic lids are; who is on the deal; key
dates; tours planned by talking; a mileage log; and a safety check-in.

brokersbestie.app · built for Legacy Properties first, then sold to other brokerages.

## What works today (version 1)

| Screen | What it does |
|---|---|
| **Today** | Search everything; "You're at" shows the codes of the property you're standing at; to-do list (tasks, dates due this week, signs to pick up, codes still coming); quick-add icons; today's tours |
| **Property** | Codes in big yellow boxes (tap to copy), Directions / Call / Text / Share showing instructions (with or without codes), key dates, to-dos, where things are (with photos), people, notes (type or talk) |
| **Quick add** | Lockbox, gate, alarm, door keypad, hidden key, sign, well/septic/shut-offs, photo, note, showing feedback, receipt, contact. Files to the property you're at. |
| **Signs & lockboxes** | What's out, what's back in the office, and what to pick up because the deal closed or cancelled |
| **Tours** | Talk or type the addresses in any order; the app orders them (no backtracking, fixed showing times kept), opens the whole route in Google Maps, and saves a tour with each stop's code, contact and status. Running late texts every listing agent at once. Finishing the tour logs the miles. |
| **Mileage & expenses** | Drives and receipts, with a tax-ready spreadsheet export |
| **Safety check-in** | A timer while you meet someone new; I'm OK / add 15 minutes / Send help now |
| **Settings** | Team sign-in, invite a teammate, home base for tours, IRS mileage rate, backup download |

It works with no signal: everything saves on the phone first.

**Version 2 (not built yet):** forward emails to file them, connect Gmail / Drive /
Dropbox, read an MLS sheet into a listing, brokerage owner view, App Store version.

## Two modes

- **On this phone** (works now, no setup): everything is saved on the phone. Nothing
  leaves it. Safety check-in buzzes and opens a text for the agent to send.
- **Team mode** (needs the three setup steps below): sign in by email link, data saved
  to the team's private database and shared with teammates, photos backed up, and
  safety alerts text the contact automatically even if the agent's phone is dead.

## Turn on team mode (one time)

1. **Database.** Create a new project at supabase.com (not Legacy's). In its SQL
   editor, paste and run `db/001_schema.sql`. Then in Authentication → URL
   Configuration, add `https://brokersbestie.app` as the Site URL.
2. **App settings.** Put the project's URL and anon (publishable) key into
   `js/config.js`. Both are safe in the browser: row-level security only lets a
   signed-in team member reach their own team's rows.
3. **Hosting.** Import this repo into Vercel, point brokersbestie.app at it, and add
   these environment variables:

| Variable | What it's for |
|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Server checks who is asking and reads overdue check-ins |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | Sends the safety texts |
| `CRON_SECRET` | Any long random string; protects the every-5-minutes safety job |
| `GOOGLE_MAPS_API_KEY` (optional) | Better address lookup for tour routes on rural roads. Without it the free OpenStreetMap lookup is used. |

The safety job runs every 5 minutes, which needs Vercel's Pro plan (the free plan
only allows once a day).

## Working on it

```
npm test          # route ordering, address reading, search, schema, safety texts
vercel dev        # run it locally with the server functions
```

No build step: plain HTML, CSS and JavaScript modules. `python3 scripts/make-icons.py`
redraws the app icons.
