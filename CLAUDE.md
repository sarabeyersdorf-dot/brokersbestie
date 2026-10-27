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
- Safety: the phone keeps its own timer. **Since 2026-10-27 the SERVER side
  lives in the Supabase `reminders` function** (every 5 minutes via pg_cron):
  overdue check-ins text the contact (`safetyRun`, claim `alerted_at` first so
  nothing texts twice), and `op: 'safety'` takes start/extend/ok/help from the
  phone (`safetyCall` in `js/push.js`; help texts at once). The Vercel
  `api/cron/checkins` cron was removed from vercel.json (one sender only).
  Texting needs three Edge Function secrets: `TWILIO_ACCOUNT_SID`,
  `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`. `AUTO_SAFETY` is gone: the phone asks the
  function (`?op=key` → `safetySms`, cached in settings) and shows "Automatic
  alert is on" only when it is true. Never describe phone-only mode as automatic.
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
page. No token is stored. `DROPBOX_APP_KEY` in `js/config.js` (public; set
2026-10-27, app "Brokers Bestie" in Sara's Dropbox App Console;
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
- **Every picture has its own note** (Sara, 2026-10-25: "each photo must
  have a note field"). `fileItem(f)` = thumbnail + note box; the note is
  `files[].note`, saved quietly when the box is left (tour card, planner, new
  property form, and a property's Notes tab via `[data-notefiles]`). A stop's
  photo note also rewrites the mirrored property note's text. The note box is
  focused right after a photo is taken. Code boxes never show an example
  number as placeholder (it reads like a real code at the door).

## Follow Up Boss (2026-10-27)

Sara: "can we add follow up boss or add your crm api key?" Settings → Connect
your CRM → **Your CRM: Follow Up Boss** takes the agent's FUB API key (FUB:
Admin → API). `crm_links.provider = 'fub'` (db/009, with `tz` from the phone),
key in `feed_key`, server-only, never returned. `api/_lib/fub.js` turns the
FUB account into a Bestie Feed v1 object (`fubToFeed`), so everything after
that is the same `mapFeed` path as Legacy: deals → properties (deal name =
address, `fubStatus` reads the stage/pipeline words, closed/lost deals older
than 120 days dropped), deal people → contacts (phones/emails via
/people/{id}), escrow close date → a "Close of escrow" date, appointments
(-7..+60 days, UTC → the agent's tz) → calendar, tied to a deal through an
invitee. **Pull only**: nothing is written to FUB; phone edits to a FUB
appointment stay in Bestie (crm_dirty cleared). FUB field names are read
tolerantly (stageName or stage.name...) because the official docs could not be
fetched; FUB only returns appointments created IN FUB by the key's owner.
"Another CRM (Bestie feed link)" is the old path (Legacy). A generic "any CRM
API key" is not possible: each CRM has its own API, so each needs a connector
like fub.js.

## kvCORE, Lofty, CINC (2026-10-27)

Sara: "add kvCORE, Cinc and Lofty too". `js/crmlist.js` (`CRM_CHOICES`) is the
ONE list Settings shows and the server checks (`KEY_CRMS`); `api/_lib/crms.js`
`CONNECTORS` maps each id to its feed function (fub, kvcore, lofty) and a test
fails if one is missing. Key-connected CRMs store `feed_url = 'crm:<id>'`.
- **Lofty**: key from Settings → Integrations → API, header
  `Authorization: token <key>`, base api.lofty.com. Transaction fields per
  Lofty's docs (transactionId, leadId, transactionName, transactionType,
  transactionStatus, homePrice, expectedCloseDate/closeDate in ms); leads via
  /v1.0/leads/{id}; appointments tried at /v2.0/appointments then tasks.
- **kvCORE / BoldTrail**: "User" token from Lead Engine → Lead Dropbox → My
  API Tokens (1 year), `Authorization: Bearer`, base api.kvcore.com/v2/public;
  transactions tried at /transactions, /transaction, /deals; contacts at
  /contact/{id} or /contacts/{id}. No appointments (not in its public API).
- Both were written WITHOUT the full reference (docs sites unreachable): list
  endpoints are tried in order, fields read tolerantly (`pick`, `toDay`
  handles ISO / seconds / ms), and each sync stores the FIELD NAMES that came
  back in `crm_links.last_shape` (db/010; names only, never values). After a
  tester's first sync, read last_shape and fix the connector to match.
- **CINC** is listed as "coming soon" and cannot be saved: CINC only allows
  approved integrator apps (OAuth with client id + secret from CINC, token at
  authv2.cincapi.com). Sara has to apply to CINC as a partner first.

## Texts Bestie writes, the agent sends (2026-10-27)

Sara chose review items 1, 2 and 4: feedback to the listing agent, request
and confirm showings, the buyer's tour recap. `js/messages.js` is the one
place the words are written (pure, tested): `feedbackText` (one professional
line per face, `FEEDBACK_LINES`; NEVER the private reaction note),
`requestGroups`/`requestText` (one text per listing agent covering all their
homes on the tour, asks for showing instructions when a stop has no code),
`recapText` (each home, the face in words, the MLS link). Everything goes
through `composeSheet` in app.js: the agent sees and can edit the text, then
it opens THEIR text or email app (`sms:` / `mailto:`); Bestie sends nothing.
- After a face is saved on a stop with an agent phone, the feedback sheet
  opens; the stop card keeps "Text feedback to <agent>" / "✓ Feedback sent".
  Stamps `feedback_sent_at` on the stop.
- Tour page: "Showings · N of M confirmed · K waiting" card with "Text the
  listing agents to request times"; stamps `requested_at` on those stops;
  "Mark confirmed" stays manual.
- "Send <buyer> the tour recap" (tour page, once a home is shown) and "Send
  <buyer> every home they've seen" (buyer page). Buyer phone/email typed once
  in the sheet, kept on the tour (`tours.buyer_phone`, `buyer_email`,
  `recap_sent_at`, db/011).

## Profile & branding, and the open house sign-in (2026-10-27)

Sara: "build the open house sign-in and make sure that users can add their own
branding, brokerage, license #'s when they set up".
- **profiles** (db/012, synced, team RLS): one per agent (`owner` = first-name
  key). `#/profile`: name, title, phone, email, license #, brokerage, brokerage
  license #, brokerage phone, website, brand colour, logo, headshot (images in
  the photos bucket by id; `logo_path`/`headshot_path` filled on upload).
  `PROFILE_FIELDS` is the form; a schema test checks every field has a column.
  `myProfile()` = settings.profileId, else the team profile with my first name.
  Saving sets `myName` from the full name. Settings shows it (`brandBand`);
  Today nudges "Make it yours" until a profile exists or "Later".
- Licenses print as typed ("DRE #02141987"); a bare number reads "Lic. #…"
  (`licenseText`, messages.js). `signOff(profile)` = name / brokerage ·
  license / phone, used on the open house thank-you.
- **Open house** `#/openhouse/<property>` is a KIOSK (route tab 'kiosk' →
  `body.kiosk` hides the nav, mic and update bar): branded band, address,
  first/last name, phone, email (phone OR email required), agent yes/no (+
  name), selling yes/no, timeframe, "may contact me" tick (unticked by
  default). Saves a **visitors** row (db/012) quietly, shows "Thank you,
  <name>!" for 3.5 s, then a fresh form. Never shows other visitors.
  "Agent: end open house" (confirm) → `#/visitors/<property>`.
- `#/visitors/<property>`: visitors by day with "Has an agent" / "Selling
  too" tags, call, and a thank-you text (`ohThanksText`: someone with an
  agent is only thanked and pointed back to their agent, never solicited),
  stamped `followed_up_at`; "Download visitors" CSV (`visitorsCsv`) for any
  CRM import. Entry: the property page's "Open house sign-in" / "Visitors · N".

## The weekly seller update (2026-10-27)

Sara: "build it as described ... reconcile succinctly with [the seller portal]
or provide a link to the portal for more metrics". "Send seller update" on a
listing's page, and a **Seller updates · N** card on Today for my listings with
none in 7 days ("Next week" hides it 7 days, `bb:sellerdue`). `sellerStats` in
`js/brief.js` is the one count: showings this week / since `list_date` (shown
tour stops + `showing` appointments, never cancelled ones), "Showing feedback"
notes from the week, open house sign-ins as COUNTS only (visitors, without an
agent, also selling), the next 14 days. `sellerUpdateText` in `js/messages.js`
writes it; a face from our OWN tour goes as the face only, never our buyer's
note. Through `composeSheet`: the agent edits and sends; `seller_update_at` is
stamped. db/013: `properties.list_date`, `portal_url`, `marketing`,
`seller_update_at`.
- **From the CRM** (Legacy's feed sends them): `list_date`, `portal_url` (the
  seller's own portal) and `marketing` `{ listtrac, homes }`. The text gives ONE
  online line, ListTrac first else Homes.com, named and dated, never added
  together, then "More numbers on your portal: <link>". `mapFeed` only sends
  these keys when present, and `upsert` in `api/_lib/crm.js` groups rows by
  their keys, so a date the agent typed is not blanked by a CRM without one.

## Today cleanup (2026-10-27)

Today's order is: the briefing, "You're at", To do, Tours, Seller updates,
Quick add, Active, then setup cards (install, profile) LAST. Empty To do / Tours
sections are gone; a "Plan a tour" / "Add a to-do" button stands in. The
filter chips are folded into one line (`details.filters`), open while a filter
is on, with ✕ to clear (Today and Calendar). The install card on Today is one
line (`installCard({ slim: true })`), the steps open on a tap. Tell Bestie
shrinks to a round mic once the page is scrolled (`.fab.mini`), and `.wrap`
has 140px at the bottom so the last card scrolls clear of it.

## At the door (2026-10-27)

`#/door/<tour>/<stop index>` (`viewDoor`), opened from the yellow **At the
door** button on every tour stop. Black and yellow, kiosk tab (no nav, no
mic): every code huge and tap-to-copy (`doorCodes` in `js/brief.js`: the
stop's code first, then the property's saved codes, each value once), how to
get in (stop access note, stop notes, the property's showing instructions),
Occupied / confirmed / time, Call and Text the listing agent, Mark shown
(opens the reaction faces), and the next stop with a Drive link. The screen is
kept awake while it is open (`navigator.wakeLock`, where the phone allows it;
released on leaving).

## Pop-up reminders (2026-10-27)

Settings → **Reminders on this phone** (`js/push.js`): before each appointment
or tour (15/30/60 min, `lead_minutes`), a 7:30 "Today in Bestie" list when
something is due, and "Are you OK?" when a safety check-in runs out (to that
agent only). **Supabase sends them, not Vercel**: `pg_cron` job
`bestie-reminders` posts to the Edge Function `reminders`
(`supabase/functions/reminders/`, deployed with the MCP, `verify_jwt` off,
its own `x-cron-token` from `push_config`) every 5 minutes. `due.js` decides
what is due (pure, `test/reminders.test.mjs`); `webpush.js` is Web Push on
WebCrypto alone (aes128gcm + VAPID, checked against the `http_ece` reference
in testing). The VAPID keys were made by the function on first run and live
in `push_config` (RLS on, no policies): nobody pastes a secret. `push_subs`
(one row per phone, own rows only), `push_sent` (each reminder once per
phone, pruned after 4 days), db/014. A 404/410 from Apple/Google drops the
phone. On an iPhone it only works from the home-screen app; the card says so.
**Redeploy the function after editing any file in that folder** — the repo
copy does not deploy itself.

## Vendors, one-tap status, Undo, bright sun mode (2026-10-27)

- **Vendors** (`#/vendors`, from Today's bottom buttons; db/015 `vendors`,
  synced): name, company, trade (`VENDOR_TRADES`), phone, email, notes,
  favorite (shows first). A property's People tab has **From my vendors**,
  which copies one onto the property as a person (role = trade · company).
  Search on Today finds vendors (`parse.js`, `href: '#/vendors'`).
- **Status** on the property page: one chip per status above the tabs, saved
  on tap with Undo. Disabled on a CRM property (the CRM owns status).
- **Undo**: `undoToast(msg, fn)` in `ui.js` (6 s, sits above Tell Bestie).
  `store.remove` returns what went and `removeProperty` returns everything
  filed under it; `store.restore(list)` puts it back and cancels a delete not
  yet sent. Every sheet's Delete goes through `del()` in app.js, so the
  "are you sure?" there is gone; deleting a property or a tour still asks
  first AND offers Undo. Ticking a to-do or deadline done offers Undo too.
- **Bright sun mode**: Settings switch, `settings.highContrast` → `html.hc`
  (black on white, 18px, 2px black lines), applied on every screen.

## Visual pass (2026-10-27) — supersedes the colour list above

Sara: "do your recommendations". **One meaning per colour**:
- **Teal = Bestie itself** (buttons, links, tabs, the header line). Nothing else.
- **Kinds** (calendar, Today): Showing **purple** (`--k-showing`, was teal),
  Appointment blue, Deadline orange (red once late), Closing green, To-do grey.
- **Property status** (`--s-*`): My listing **rose**, Coming soon **gold**, In
  escrow **brown**, Showing / other agent **slate**, Closed / Cancelled grey.
  No colour appears in both lists.
- Plain `.btn` is a quiet filled button with no outline; `.btn.dark` is the one
  main action on a screen. Darker small text, labels and card edges.
- Status on a property page is one line ("Status [pill] Change") that opens a
  2-column picker (`details.status-pick`); read-only on a CRM property.
- Unknown occupancy shows nothing (the lone "?" read as an error).
- **The lockbox buddy**: `buddy(text, mood)` in app.js for empty spots
  (properties, people, where things are, tours, buyers, vendors), a winking
  buddy beside the morning greeting, and a "Tour done!" sheet with the love
  face and "Send <buyer> the recap".

## Open house sign-in by QR code (2026-10-27)

The open house kiosk has a **QR code** button: `qrSheet()` makes one
`oh_links` row per property per day (db/016, team RLS, 3-day expiry, cached in
`bb:ohlink:<pid>:<day>`) and draws the QR with `qrcode-generator@1.4.4` from
jsdelivr. Visitors land on **`oh.html?t=<token>`**, a standalone page (no app,
no sign-in) branded from the agent's profile (name, brokerage, license, brand
colour). It talks only to the `reminders` function: `GET ?op=oh` (address +
branding; 404 once ended) and `POST {op:'visit'}`, which checks the link,
cleans the fields (`cleanVisit` in `safety.js`, tested), drops anything with
the hidden `website` field filled (robots), caps 300 a day per property, and
writes a `visitors` row (`id` `web-…`, notes "Signed in on their own phone").
The visitor list syncs when opened, so web sign-ins show up there.

## Six more (2026-10-27, Sara: "build it all")

- **Leave-by reminders**: `due.js` uses the phone's last location (sent by
  `shareWhere` in `js/push.js` when Bestie already had a fix, at most every 10
  minutes, only with reminders on; db/017 `push_subs.from_*`) or the home base
  (`base_*`), and the property's pin: drive (`driveMin`, same estimate as
  route.js) + 5 min to park → "Leave now: … About N min to …". No origin or
  no pin → the fixed 15/30/60-minute reminder as before.
- **Feedback from agents who show MY listings**: showings get "Showing agent"
  + phone (db/018 `events.showing_agent*`, `feedback_asked_at`,
  `feedback_logged_at`). `feedbackDue` (brief.js): my listing, kind showing,
  in the last 7 days, over → a **Showing feedback** card on Today: **Ask**
  (`feedbackRequestText`, composeSheet, their own phone) then **Log it**,
  which files a "Showing feedback: …" note, so the seller update picks it up.
- **24-hour code links**: Share sheet → "Make a 24-hour link" (`shareLink`,
  db/019 `share_links`, team RLS, `revoked`, 24h expiry) → `share.html?t=`,
  read only through the `reminders` function `GET ?op=share` (codes, where,
  showing notes, directions, map, the agent's phone). "Stop links now" revokes.
- **Tax year** `#/taxes/<year>` (from Mileage): `taxYear` / `taxCsv` in
  brief.js: miles, deduction at the IRS rate (editable there), expenses, by
  month, "Before you send it" (drives with no purpose, expenses with no
  receipt photo), one CSV for the accountant.
- **Showings from confirmations** `#/showings` (Calendar → "Add showings from
  a confirmation"): paste ShowingTime / BrokerBay / an agent's text, or a
  screenshot → `api/read-showings.js` (Claude, structured) → `planShowings`
  (`js/showings.js`, tested): exact street match else a new "Showing / other
  agent" property; New / Time changed / Cancelled / Already on your calendar;
  new codes and the listing agent are added. Nothing is saved until ticked.
- **Welcome**: first open (no properties) shows 4 cards with the buddy
  (`showWelcome`, `settings.welcomed`); Settings → "Show the welcome again".
- **Not built: sign-up trial and payments.** Needs Sara's Stripe account and a
  pricing decision first. Sign-up itself already exists (email code + team).

## Coloured section headers, Dropbox for branding (2026-10-27)

- Sara: "highlight each header ... with unique colors". `colorHeaders()` runs
  after every render and gives each section label (`.sec-head > .label`,
  first `.label` in a card/section) a solid colour band (`.label.hd`,
  `data-hue`). `headerHue()` in app.js is the one rule: a header that names a
  kind of thing takes that thing's colour (Getting in = code yellow, Tours /
  Showing = purple, Key dates = orange, To do = grey, Seller updates = rose,
  Safety = red, People / Vendors = blue, Notes = green...); any other header
  gets a fixed colour from `HEADER_PALETTE` by its words, so it never changes.
  The morning greeting keeps its own look.
- Dropbox for logo and headshot: Settings → Your profile & branding has
  **Logo from Dropbox** / **Headshot from Dropbox** (saved straight to the
  profile), and the profile page has the same two buttons beside the photo
  pickers. `chooseFromDropbox({ images: true, multi: false })`.

## Contacts: CRM sync choice and import (2026-10-27)

Sara: "add a sync contacts option, should ask when clients link their crm but
also need an import option". `contacts` (db/020, synced, team RLS) is the
agent's address book, apart from `people` (who is on a property).
- **Connecting a CRM asks** (Settings → Connect your CRM, required before
  Save): "Just the people on my deals" or "All my contacts" →
  `crm_links.contacts_mode` ('deals' | 'all'); changing it later calls
  `op: 'contacts'` and syncs. On 'all', `runSync` fetches the list
  (`CONTACT_LISTS` in crms.js: FUB `/people`, Lofty `/v1.0/leads`, kvCORE
  `/contacts`; a feed link gets `?contacts=all`, which Legacy serves),
  `mapFeed` maps `feed.contacts` to `crm:<team>:c:<ext>` rows (kind via
  `kindFrom`, notes never), upserts, and prunes CRM contacts gone from the CRM
  (only when under `MAX_CONTACTS` = 3000). On 'deals' the CRM contacts are
  removed. Typed and imported contacts are never touched.
- **Import** (Contacts → Import contacts): a .csv (columns found by header
  words, any order) or .vcf from a phone. `js/contacts.js` (pure, tested):
  `parseContacts`, `planImport` skips anyone already there by phone digits or
  email; untyped rows are filed as the kind picked (default Sphere).
  `store.saveMany` writes them in one go.
- `#/contacts` (from Today's bottom buttons, and search): kind chips, first
  100 matches, call/text, edit sheet. A property's People tab has **From my
  contacts**.
- **The store reads every table in pages of 1,000 and upserts in groups of
  500**: Supabase returns at most 1,000 rows per ask, and a short read used to
  drop the rest from the phone.
- **Just some groups** (Sara, same day: "give option ... to import just
  specific groups ... such as vendors and clients"). Under "My contacts too"
  in Settings a tick box per kind (Clients = buyers, sellers, past clients;
  Leads; Sphere; Vendors; Other), all ticked by default; changes sync after a
  1.5 s pause. Stored in the SAME column, no migration: `contacts_mode` =
  'deals' | 'all' | 'some:client,vendor' (`contactsChoice` / `contactsMode`
  in js/contacts.js, the one rule for phone and server). `runSync` keeps only
  the ticked kinds and the prune clears the rest. The import sheet shows the
  groups found in the file (from its Type/Stage/Tags column) with counts, to
  untick before importing.

## Hello, what are we doing today? (2026-10-27)

Sara: "put seller updates on another screen. I think the homepage screen
needs to be a hello [name] what are we doing today?" Today's header now
reads the date, **Hello <name>** and "What are we doing today?", then six big
choices (`doTiles`): Show homes (today's tour if there is one, else the
planner), At a property (the old "Where am I?" button), Open house
(`openHousePicker`: straight in with one listing, else pick), Seller updates
(red count when due), Add a property, Log a drive. The briefing card follows
as "Your day". **Seller updates are their own screen** (`#/updates`,
`viewSellerUpdates`: due this week, then sent in the last week); the Today
card and its "Next week" snooze are gone.
