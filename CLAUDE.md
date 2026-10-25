# Brokers Bestie: notes for Claude Code

Sara Cooper (broker-owner, Legacy Properties) is building this to sell to other
brokers. She is not a programmer. Recommend the simpler path when there is one, in
plain words, and let her choose.

## Decisions already made (2026-10-22)

- **Name:** Brokers Bestie (no apostrophe), brokersbestie.app.
- **Look:** Look B "Field Kit", Charcoal + Teal. Barlow Condensed for codes, prices
  and times; Barlow for words. Codes are always dark numbers on yellow (`--code`).
  The mock-up canvas lives in Claude (artifact "Brokers Bestie App Mockup").
- **Codes show as soon as the agent is signed in**: no extra taps to reveal them.
  Sara's call: the point is a quick view without hoops.
- **Their data in one place is the product**; codes and routing are why they open it.
- **Web app on the home screen first**, App Store later.
- **Separate from the Legacy CRM.** Its own Supabase project and repo. Legacy is the
  first customer, never a dependency. (2026-10-24: the project
  `bycsdukxwzkahaxnkmgb` was TRANSFERRED into the Legacy Supabase organization
  so every Claude can reach both. Same URL, keys and data; still its own
  database, never merged with Legacy's. Its GitHub integration was
  disconnected to allow the transfer and is not needed.)

## How it is built

- No build step. `index.html` + `css/app.css` + ES modules in `js/`.
- `js/store.js` is the only place data is read or written. Phone first
  (localStorage, photos in IndexedDB), synced to Supabase in team mode.
  Newer `updated_at` wins. Sample rows (`sample: true`) never sync.
- `js/route.js` and `js/parse.js` are pure and tested. Route ordering is exact
  for up to 8 stops; it penalises backtracking (Sara's route-sheet rule: one
  continuous path, an outlier goes first or last) and lateness to a fixed window.
- Tour route screen (Sara, 2026-10-23): tap a home to pin its showing time
  (owner-occupied homes are marked O and prompted), drag the grip to set your
  own order (`routeInOrder`), "Use Bestie's order" re-optimises around pins.
  A pinned time is a constraint, not a position: prefer pinning to dragging.
- `db/001_schema.sql`: every table carries `team_id`, RLS via `bb_is_member()`.
  **Any field the phone writes must have a column**, or the first sync fails;
  `test/schema.test.mjs` checks the edit form and sample data against the SQL.
- `sw.js` caches the app for offline. **Bump `VERSION` when an app file changes,
  and `APP_VERSION` in `js/config.js` to the same value** (a test checks). The
  app asks for an update each time it is reopened and reloads itself when the
  new copy takes over (a button instead if a sheet or form is in use), so a
  home-screen copy never sits on an old version (James, 2026-10-24, could not
  see Send feedback). Settings shows the version at the bottom.
- Safety: the phone keeps its own timer; in team mode `api/cron/checkins.js` texts
  the contact after the time is up (cron is DAILY until Vercel Pro; then set
  `*/5 * * * *` in vercel.json — Hobby refuses to deploy anything more often), claiming the row first so it can
  never text twice. Never describe phone-only mode as automatic.
  `AUTO_SAFETY` in `js/config.js` is false until Twilio is set AND the job runs
  every 5 minutes: while false every agent sees phone-only wording and nothing
  is registered with the server (2026-10-24, before outside testers).
- Everything typed is escaped by `html``…``  in `js/ui.js`. Don't build markup by
  string concatenation outside it.

## License numbers (if a screen ever needs them)

Legacy Properties DRE 02254944 · Sara Cooper DRE 02141987 · James Beyersdorf DRE
02122175. `02554944` is a known wrong transposition.

## MLS sheets and Tell Bestie (2026-10-23)

- **MLS sheet** (`#/sheet`, `#/sheet/<property>`): snap pages or pick a photo/PDF.
  `api/read-sheet.js` reads it with Claude; the phone shows what was found and
  saves only what is ticked. A blank field is filled (ticked); a field that
  already differs is offered UNticked, so a sheet never overwrites what the agent
  typed (`sheetChanges` in `js/assist.js`). The pages stay on the property as a
  note (`notes.source = 'mls_sheet'`, `notes.files` = [{id, type, path}], db/002),
  even when reading fails.
- **Tell Bestie** (the floating mic, hidden on screens with their own form):
  `api/assist.js` turns what was said into actions; each shows as a line to
  confirm. Note/code/date/person with no property ask for one. If Bestie can't be
  reached, the words can still be saved as a to-do or note.
- Both need `ANTHROPIC_API_KEY` in Vercel and a signed-in agent (they cost money
  per use). `api/_lib/ai.js` is the one place that calls Claude; it uses
  `fallbacks: 'default'` so a declined request is retried on a fallback model.
- `dictate()` finishes once and leaves typed words alone if nothing was heard.

## Calendar, morning briefing, CRM sync (2026-10-23)

- **Calendar** (`#/calendar`, in the bottom nav where Signs was; Signs is a
  button on Today): `events` table (db/003). `js/brief.js` is the one
  definition of what is on a day (`dayItems`: events, tours, deadlines,
  to-dos) and of the briefing (`briefing`, `briefingText`). Tell Bestie's
  `event` action makes appointments (an appointment is never a to-do now).
- **Phone calendar**: Settings → "Your phone's calendar" →
  `/api/cal/<token>.ics` (team calendar, token from `bb_cal_token`, floating
  times). `cal_feeds` and `crm_links` are RLS-on with NO policies: server only.
- **CRM sync**: any CRM serving **Bestie Feed v1** (`api/_lib/feed.js`
  documents it). Legacy serves it at `/api/crm/bestie-feed` (its own
  `BESTIE_FEED_KEY`). `runSync` upserts with stable ids
  `crm:<team>:<kind>:<ext>`; the CRM owns address/status/price/MLS/COE, people,
  deal dates and appointments; it never writes codes, notes, photos, pins,
  showing notes, or an appointment's or deadline's `done` (CRM "done" only ever
  ticks, never un-ticks: `doneDates`). CRM ids contain colons: never `split(':')`
  an id. Appointments cancelled in the CRM
  are removed from today on. Phones trigger it hourly on open (`op: 'auto'`);
  `api/cron/crm-sync` runs daily.

## Two-way CRM sync (2026-10-23)

Sara: "yes add the two-way sync to the CRM". Only two things go back, and the
CRM decides how to apply them (Legacy: `applyChange` in `crm-bestie-feed.js`):
a CRM deadline ticked/unticked (-> timeline item done/upcoming, logged on the
deal) and an appointment on a CRM property added, changed or deleted (-> the
CRM calendar, always `internal`, never a client portal). Nothing else is ever
written to a CRM.

- `store.save` sets `crm_dirty` on a CRM-linked date/event (`crmLinked`) and
  the phone asks for a sync 5s later. Deleting a CRM-linked appointment sets
  `cancelled` (hidden everywhere) instead of removing it.
- `runSync` SENDS first (`pushChanges` in `feed.js`, POST to the feed link),
  then PULLS, and the pull skips any row still `crm_dirty`. A new appointment
  the CRM accepted is re-keyed to `crm:<team>:e:<crm id>` so it is not doubled.
  A CRM that answers 405 to POST keeps the changes waiting and says so.
- db/004: `dates.crm_dirty`, `events.crm_dirty`, `events.cancelled`.
- **CRM tasks are NOT brought in** (Sara, 2026-10-23: "this is getting too
  much like a crm ... remove the CRM tasks"). Added and removed the same day;
  `runSync` clears any `tasks.source = 'crm'` rows. Bestie is the field
  companion: properties, codes, contacts, appointments, contract deadlines. Do
  not add CRM back-office data (task lists, pipelines, lead stages) without her.

## Colours and filters (2026-10-24)

Sara: "work on the colors so things are easy to spot and differentiate. also
want a filter". One colour per KIND of thing, the same on every screen, always
with its word beside it (`ktag`): Showing teal, Appointment blue, Deadline
orange (red "Overdue" once past), Closing green, To-do grey. Yellow stays for
codes only. `COLOR_KINDS` / `itemKind` in `js/brief.js` are the one
definition; css `.c-<kind>` sets `--k`. Property status: My listing teal,
Coming soon purple, In escrow orange, Showing/other agent blue, Closed grey.
Filter chips on Today and Calendar (+ one-property picker on Calendar), saved
per phone in `bb:filter`; Properties has a Sort (`PROP_SORTS`, `bb:propsort`).
A "Mine / James" filter waits until there is a second person on the team.
- **Mine / <name>** (2026-10-24, after James joined): `owner` (db/007) on
  properties, events, tasks, tours = a first name in lower case. The phone
  stamps it on anything new from Settings -> Your first name (`store.save`);
  the CRM sync sets it from the CRM's agent (`ownerKey`), and an appointment
  without one takes its property's. `both` or empty = the whole team, shown
  under everyone (`isWhose`). Chips appear once `teamNames` finds a second
  person; "Mine" asks for your name if it is not set.

## The lockbox buddy: icon, showing reactions, safety face (2026-10-24)

From Cowork's spec (`20261023_CWtoCC_brokersbestie-reactions-and-icon.md`).
`js/faces.js` is the one drawing: `REACTIONS` (8, in order: love, like, maybe,
nope, pricey, work, again, offer), `reactionFace`, `okFace`, `ICON_SVG`.
- **App icon** = the winking buddy on #202428 (manifest colours match).
  `icons/*.png` are rendered from `ICON_SVG` (Playwright screenshot); the 32px
  favicon drops the blush dot. Re-render all of them if the art changes.
- **Showing reactions**: Mark shown opens "How did they like it?" (4x2 faces,
  optional note, "Save: <label>"). Saved on the stop as `reaction`,
  `reaction_note`, `reaction_at` (inside `tours.stops` jsonb, so no migration;
  in the backup with the tour) and filed to the property as a "Showing
  feedback" note. The stop card shows the face; tap it to change.
- **Safety**: the gentle "You OK?" face on the running check-in and the
  time-up prompt.
- **Buyer pages** (Sara, 2026-10-24, chose a Bestie page over the CRM):
  `#/buyers` and `#/buyer/<key>` (from Tours). A tour's buyer is `tours.buyer`
  (db/008), set by the planner's "Who is it for?" or the tour header; older
  tours read it from the name "X · home tour" (`buyerOf`). `buyers()` in
  `js/brief.js` groups every shown home across tours, one row per home with its
  latest face; tap a face to change it. Nothing goes to the Legacy CRM.

## Add to home screen (2026-10-24)

Sara: "the add to homescreen doesn't work". The site passes Chrome's install
check (no installability errors), so the help is in the app: `js/install.js`
shows an "Install Bestie" button when Android offers one
(`beforeinstallprompt`), otherwise steps for the phone and browser it is in
(`platform()`), and tells an in-app browser (Gmail, Instagram, Google app) to
open Safari/Chrome first, since those cannot add to the home screen. Shown
on Today until installed or "Not now", and always in Settings.
`[hidden]` is `display:none !important` in css (a `.btn` overrode it).
- **Send feedback** (Settings, 2026-10-24, for the first outside testers):
  `feedbackLink()` in `js/install.js` opens the tester's own mail app to
  Sara (`FEEDBACK_TO`) with their phone, browser, sign-in state and app version
  filled in. It is the FIRST card in Settings.
  No server, nothing stored.

## Sign in with a code, not a link (2026-10-24)

James kept being asked to sign in: on iPhone the emailed link opens Safari or
Gmail's browser, which signs THAT browser in, not the home-screen app (it has
its own storage). Then repeated requests hit Supabase's built-in email limit
(a few an hour: `over_email_send_rate_limit` in the auth log). Settings now
sends a code (`signInWithOtp`) and the app signs itself in with
`verifyOtp({ type: 'email' })` (`store.verifyCode`); `authMessage` says the
limit and an expired code in plain words. **The Magic Link and Confirm signup
email templates in the Supabase dashboard must contain `{{ .Token }}`**, or
the email has no code to type. Custom SMTP (Resend) lifts the hourly limit.
- **Done 2026-10-24 (by Cowork):** Supabase sends through Resend
  (`smtp.resend.com:465`, user `resend`, key "Brokers Bestie Supabase") from
  "Brokers Bestie" <noreply@send.brokersbestie.app>; `send.brokersbestie.app`
  is verified in Resend (3 DNS records at GoDaddy). Email limit 30/hour. Both
  templates ("Magic link or OTP", "Confirm sign up") carry `{{ .Token }}`.
  Templates are locked again if custom SMTP is ever turned off.

## MLS sheet: From Dropbox (2026-10-24)

Sara: "in the upload MLS option add a dropbox option". `js/dropbox.js` opens
Dropbox's own Chooser (`dropins.js`, `linkType: 'direct'`): the agent signs in
to their own Dropbox in Dropbox's window and Bestie downloads only the picked
files (short-lived links), then they go through `addSheetFiles` like any other
page. No token is stored. Needs `DROPBOX_APP_KEY` in `js/config.js` (public;
allowed domains are set in the Dropbox App Console). With no key the button
explains the Files-app route (Photo or PDF -> Browse -> Dropbox).

## Codes, notes, MLS sheet and photo notes right on each stop (2026-10-25)

Sara: "code and note field that dont open a new screen - user saves and it
doesnt need to refresh ... upload mls sheet, link to it or snap a picture ...
into each stop a place to snap and save picture notes."
- `stopFieldsHtml` / `wireStopFields` (app.js) are the ONE set of stop fields:
  Code, MLS link, Notes, MLS sheet (photo/PDF), Photo note (camera). Used in
  the planner's check step (folded under "Code, notes, MLS sheet"; typed values
  live in `plan.stops` and `tourStop()` carries them into the saved tour, a
  typed code winning over the property's) and on every tour card.
- On a tour card, Save (or leaving a box) stores with
  `store.save(..., { quiet: true })`: no emit, so the page is not redrawn.
  Because of that the card's handlers read stops FRESH from the store
  (`fresh()` in viewTour), never the array the screen was drawn with.
- Stop files are `stop.files = [{ id, type, kind: 'mls'|'photo', at }]` inside
  `tours.stops` jsonb (no migration). `store.photoPath(f)` derives the storage
  path, so a file added before its tour existed is still found elsewhere.
- On a stop with a saved property, a new code is also added to the property's
  access (if not already there) and files are filed as a property note
  (`source` `mls_sheet` or `showing_photo`).
- Add a property (new only) has "Getting in, notes & MLS sheet": code + kind,
  notes, MLS link, snap or pick the sheet.
