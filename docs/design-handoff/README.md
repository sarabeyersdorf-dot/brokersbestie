# Brokers Bestie: design handoff for Claude Design

**From:** Sara Cooper, broker-owner, Legacy Properties (the builder and first customer)
**Date:** 2026-10-28 · app version bb-v58 · live at https://brokersbestie.app
**What I want from you:** suggestions on UI and features. Mock-ups are welcome; plain-words notes are too. I'll choose what gets built.

Screenshots of today's app (iPhone size, 390px wide, sample data) are in this folder:

| File | Screen |
|---|---|
| `01-today.png` | Today (home) |
| `02-calendar.png` | Calendar |
| `03-properties.png` | Properties list |
| `04-property.png` | One property (codes, showing notes, key dates) |
| `05-tours.png` | Showing tours |
| `07-open-house-kiosk.png` | Open house sign-in (kiosk mode) |
| `08-quick-add.png` | Quick add |
| `09-settings.png` | Settings |
| `10-your-plan.png` | Your plan (billing; signed out here) |
| `11-contacts.png` | Contacts |
| `12-seller-updates.png` | Seller updates |

Ignore two things in the long screenshots. The dark bottom bar and the "Tell Bestie" button sit in the middle of the image only because the full page was captured; on a phone both stay pinned to the bottom of the screen. The empty white space at the bottom is also from the capture.

---

## 1. What it is, in one line

**A field companion for real estate agents: everything you need at the property, in your pocket.** That covers the gate code, lockbox spot, showing notes, the route between showings, who to call, and what's due today. It is not a CRM. It can pull from one (Follow Up Boss, kvCORE, Lofty, or our own Legacy CRM), but it doesn't try to replace one.

**Who uses it:** a working agent in the Sierra foothills (and soon other brokerages):
- In a truck, in full sun, at a gate with no signal.
- One hand on the phone, often with a client beside them.
- Driving long rural routes: wells, septic, dirt roads, gates, dogs.

**The product is the agent's own data in one place. Codes and routing are why they open it.**

**Business:**
- Sold to other brokers: $99/yr per agent, $69/yr founding price through Dec 31 2026, or $12/mo.
- 14-day free trial, no card.
- A home-screen web app (PWA) now; the App Store later.

## 2. Decisions already made (please design within these)

- **Name:** Brokers Bestie (no apostrophe).
- **Look B "Field Kit":** charcoal and teal. Fonts are **Barlow Condensed** (uppercase, bold) for codes, prices, times and titles, and **Barlow** for words.
- **Codes are ALWAYS dark numbers on bright yellow** (`#ffe066`). Yellow means "code" and nothing else; it must read in full sun.
- **Codes show as soon as you're signed in.** No tap to reveal, no PIN. Speed at the gate beats hiding them.
- **One meaning per colour, on every screen:**
  - **Teal = Bestie itself** (buttons, links, tabs, the header line).
  - **Kinds of thing** (calendar, Today), always shown with a word beside the colour:
    - Showing: purple
    - Appointment: blue
    - Deadline: orange (red once late)
    - Closing: green
    - To-do: grey
  - **Property status:**
    - My listing: rose
    - Coming soon: gold
    - In escrow: brown
    - Showing / other agent's: slate
    - Closed / cancelled: grey
  - **Red** is for late and errors only.
  - No colour means two things.
- **Section headers are solid colour bands** that take the colour of what they hold (Getting in = yellow, Key dates = orange, People = blue, and so on).
- **Mascot: "the lockbox buddy",** a yellow padlock with a face. It is the app icon (winking), appears in empty states, and has **8 reaction faces** a buyer can give each home on a tour: love, like, maybe, nope, pricey, needs work, see again, make an offer. There is also a gentle "You OK?" face for safety check-ins.
- **Bestie never sends a text or email by itself.** It writes the message, the agent edits it, and their own Messages or Mail app sends it.
- **Plain words.** Agents aren't technical. No jargon, no "sync conflict", no "entity".
- **Bright sun mode** (Settings): black on white, larger text, heavy lines.
- **Undo** instead of "Are you sure?" for most deletes.

## 3. Design tokens (from `css/app.css`)

```
--ink #1f2326        main text, header background
--ink-2 #4a5154      secondary text
--mute #5f676a       quiet text
--bg #eef0ef         page background
--card #ffffff       cards
--line #d5dad8       card edges
--teal #19c3b1       brand / actions        --teal-text #0b7a6e (teal as text)
--code #ffe066       codes only
--done #14917f       done / confirmed
--alert #d8333a      late, errors
--k-deadline #b85508
Fonts: Barlow 400/500/600/700, Barlow Condensed 600/700/800 (Google Fonts)
Max content width 560px; 16px side padding; bottom nav 68px.
```

## 4. How the app is laid out

**Bottom nav (5):** Today · Calendar · Properties · Tours · Add (Quick add).
**Floating mic, "Tell Bestie":** say anything, e.g. "gate code at 100 Sample Ridge is pound 2580". Bestie turns it into actions you tick to confirm. It shrinks to a round button when you scroll.

**Header:** a dark band with the kicker (small teal caps), a big condensed uppercase title, a subtitle, and a 4px teal line under it.

### Screens

1. **Today (home):**
   - "Hello Sara / What are we doing today?" and a search box that searches everything.
   - **Six big choices:** Show homes, At a property (finds the nearest property by GPS), Open house, Seller updates (red count when due), Add a property, Log a drive.
   - Then: **Your day** (a spoken or listened-to briefing), To do, Tours today, Quick add tiles, Active properties, and shortcuts (Contacts, Vendors, Mileage, Signs, Safety check-in).
   - Setup cards (install, profile) sit last.
   - A filter folds into one line.
2. **Calendar:** one list (appointments, tours, deadlines, to-dos), colour by kind, filter chips, and Mine / teammate. Add showings by pasting a ShowingTime or BrokerBay confirmation or a screenshot; Bestie reads it and you tick what to add.
3. **Properties:**
   - List with status tabs (Active / In escrow / Showing / Closed) and sort.
   - **One property:**
     - Status, then Directions / Call / Text / Share.
     - **Getting in:** yellow code cards with Copy.
     - Showing instructions, then a status picker.
     - Tabs: Overview · Where things are (lockbox, signs, gear: what's out and what to pick up) · People · Notes (photos and MLS sheets live in Notes).
     - Key dates (contract deadlines, which can come from the CRM), to-dos, and driving-in notes.
     - Buttons: Edit, Snap MLS sheet (photo or PDF → Bestie reads it), Quick add, Send seller update, Open house sign-in.
4. **Tours:**
   - **Plan a tour:** talk the addresses in any order and Bestie routes them. You can pin a showing time or drag to reorder. Occupied homes are marked.
   - **Tour page:** each stop has code, notes, MLS sheet, photo notes (each photo has its own note), Mark shown (opens the 8 faces), and Text feedback to the listing agent.
   - Also: request showing times from the listing agents in one text each, and a recap for the buyer.
   - **At the door:** a black-and-yellow full screen for one stop with the codes huge (tap to copy), how to get in, call the listing agent, Mark shown, and the next stop. The screen stays awake.
   - **Buyer pages:** every home a buyer has seen, with their faces.
5. **Open house kiosk:**
   - A branded sign-in sheet on the agent's phone or iPad, with nav hidden.
   - Fields: name, phone/email, has an agent?, selling too?, timeframe, may contact.
   - Shows "Thank you, <name>!" then resets. A QR code lets visitors sign in on their own phone.
   - Visitor list afterwards, with thank-you texts and a CSV download.
6. **Quick add:** one tap for Lockbox, Gate code, Alarm, Sign, Photo, Note, Receipt, Safety check-in.
7. **Seller updates:** for each of my listings, a weekly text to the seller, written for me and counted from my showings, feedback faces and open houses, plus a link to their portal. I edit it, then send it from my phone.
8. **Also:**
   - Contacts (import from CSV or phone, or sync from the CRM by group) and Vendors (favourites first).
   - Mileage and expenses, with a tax-year summary and CSV for the accountant.
   - Safety check-in: a timer. If you don't check in, it texts your contact.
   - Pop-up reminders, including leave-now based on drive time.
   - 24-hour share links for codes.
   - Profile and branding: logo, headshot, licence #, brand colour, used on the open house sheet and texts.
   - Your plan (billing).
   - A welcome walkthrough on first open.

## 5. Where I'd most like your eyes

1. **Today is crowded.** It now has six choices, then briefing, to-dos, tours, quick add, active, shortcuts and setup cards. What deserves the top of the screen at 7am vs. at 2pm between showings? Should Today change with the time of day?
2. **Property page hierarchy.** Codes are right; below them it gets long. Better order or grouping? Are the tabs pulling their weight?
3. **The tour and At the door flow:** the most used moment in the field. One-handed, in sun, with a client. What would make it faster?
4. **Colour load.** Each kind, each status and each header has its own colour. Is it now too many? Keep the rules in §2, but suggest how to calm it.
5. **The lockbox buddy.** Where else would it add warmth without getting cute? (Empty states, tour done, safety today.)
6. **First run for a new broker.** Welcome → sign in by email code → team → connect CRM → add a listing. Where would someone get lost?
7. **Your plan / trial screen.** Make it feel fair and clear, not pushy.
8. **Feature ideas.** What's missing for a field agent that fits "field companion, not a CRM"? Things I've already said **no** to: CRM task lists, pipelines and lead stages inside Bestie.

## 6. Limits to design for

- **Phone first, 360–430px wide.** It works on tablet and desktop but nobody optimises for them.
- **Offline:** everything on the phone works with no signal; it syncs later. Don't design anything that needs the network to show a code.
- **iPhone home-screen app:** no App Store features yet (no widgets, no Siri). Pop-up reminders work only from the home-screen app.
- **Text and email are always the agent's own apps** (we open them with the words filled in).
- **Plain HTML/CSS/JS, no build step:** anything you suggest should be doable with CSS and a little script; no heavy frameworks.
- **Licence numbers, only if a mock-up needs them:** Legacy Properties DRE 02254944 · Sara Cooper DRE 02141987 · James Beyersdorf DRE 02122175. Use made-up addresses, never a real client's.

## 7. What to send back

Mock-ups or a short list, each suggestion with:
- what it changes
- why it helps an agent in the field
- how big a change it is (small tweak / new screen / new feature)

I'll pick, and Claude Code will build.
