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
  first customer, never a dependency.

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
- `sw.js` caches the app for offline. **Bump `VERSION` when an app file changes.**
- Safety: the phone keeps its own timer; in team mode `api/cron/checkins.js` texts
  the contact after the time is up (cron is DAILY until Vercel Pro; then set
  `*/5 * * * *` in vercel.json — Hobby refuses to deploy anything more often), claiming the row first so it can
  never text twice. Never describe phone-only mode as automatic.
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
