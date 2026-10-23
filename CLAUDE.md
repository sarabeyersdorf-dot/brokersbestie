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
