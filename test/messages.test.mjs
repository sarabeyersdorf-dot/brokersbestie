import test from 'node:test';
import assert from 'node:assert/strict';
import { feedbackText, requestGroups, requestText, recapText, FEEDBACK_LINES } from '../js/messages.js';
import { REACTION_KEYS } from '../js/faces.js';

test('every face has a professional line for the listing agent', () => {
  for (const k of REACTION_KEYS) assert.ok(FEEDBACK_LINES[k], k);
});

test('feedback greets the agent by first name and never includes the private note', () => {
  const t = feedbackText({ agent: 'Kim Hesser (Coldwell)', address: '433 E Highway 4, Murphys', reaction: 'pricey', reaction_note: 'buyer thinks seller is desperate' }, { me: 'sara' });
  assert.match(t, /^Hi Kim, thank you for letting us see 433 E Highway 4 today\./);
  assert.match(t, /price was high/);
  assert.doesNotMatch(t, /desperate/);
  assert.match(t, /\nSara$/);
});

test('one showing request per listing agent, covering all their homes', () => {
  const stops = [
    { address: '1 A St, Murphys', agent: 'Kim', agent_phone: '(209) 555-0101', arrive: 600, code: '1' },
    { address: '2 B St, Arnold', agent: 'Lee', agent_phone: '2095550102', arrive: 660 },
    { address: '3 C St, Murphys', agent: 'Kim', agent_phone: '209-555-0101', arrive: 720, code: '2' },
    { address: '4 D St', agent: '' }
  ];
  const g = requestGroups(stops);
  assert.equal(g.length, 2);
  const kim = requestText(g[0], { date: '2026-10-29', me: 'sara' });
  assert.match(kim, /^Hi Kim, I would like to show 1 A St around 10:00 AM and 3 C St around 12:00 PM on Thursday, Oct 29/);
  assert.doesNotMatch(kim, /showing instructions/, 'codes already known');
  assert.match(requestText(g[1], { date: '2026-10-29' }), /confirm and send the showing instructions\?/);
});

test('the buyer recap lists each home, the face and the MLS link', () => {
  const t = recapText([{ address: '1 A St, Murphys', reaction: 'love', mls_url: 'https://mls.example/1' }, { address: '2 B St' }], { buyer: 'Austin L', date: '2026-10-28', me: 'james' });
  assert.match(t, /^Hi Austin! Here are the homes we saw on Wednesday, Oct 28:/);
  assert.match(t, /1\. 1 A St, Murphys - Loved it\n   https:\/\/mls\.example\/1/);
  assert.match(t, /2\. 2 B St\n/);
  assert.match(t, /\nJames$/);
});

test('feedback sent the next day names the showing day', () => {
  assert.match(feedbackText({ address: '1 A St', reaction: 'like' }, { date: '2026-10-29', today: '2026-10-30' }), /see 1 A St on Thursday\./);
  assert.match(feedbackText({ address: '1 A St', reaction: 'like' }, { date: '2026-10-29', today: '2026-10-29' }), /see 1 A St today\./);
});

import { ohThanksText, signOff, visitorsCsv } from '../js/messages.js';
const sara = { full_name: 'Sara Cooper', brokerage: 'Legacy Properties', license: 'DRE #02141987', phone: '(209) 559-4966' };

test('the sign-off carries name, brokerage and license', () => {
  assert.equal(signOff(sara), 'Sara Cooper\nLegacy Properties · DRE #02141987\n(209) 559-4966');
  assert.equal(signOff({ full_name: 'Ann', license: '01234567' }), 'Ann\nLic. #01234567');
  assert.equal(signOff(null, 'sara'), 'Sara');
});

test('an open house thank-you invites a visitor without an agent, and only thanks one who has an agent', () => {
  const a = ohThanksText({ first_name: 'maria', has_agent: false, also_selling: true }, { address: '433 E Highway 4, Murphys', profile: sara, date: '2026-11-01', today: '2026-11-01' });
  assert.match(a, /^Hi Maria, thank you for stopping by the open house at 433 E Highway 4 today!/);
  assert.match(a, /talk about selling yours/);
  assert.match(a, /Sara Cooper\nLegacy Properties · DRE #02141987/);
  const b = ohThanksText({ first_name: 'Ben', has_agent: true, agent_name: 'Kim Hesser' }, { address: '433 E Highway 4', date: '2026-11-01', today: '2026-11-02' });
  assert.match(b, /on Sunday\. If you or Kim have any questions/);
  assert.doesNotMatch(b, /see other homes/);
});

test('visitors export as a spreadsheet, commas and quotes kept safe', () => {
  const csv = visitorsCsv([{ oh_date: '2026-11-01', first_name: 'Ann', last_name: 'Lee, Jr', phone: '209', email: 'a@b.c', has_agent: false, consent: true, property_id: 'p1' }], () => '433 "E" Hwy 4');
  const [head, row] = csv.split('\n');
  assert.match(head, /^Date,First name,Last name,Phone,Email,Has an agent/);
  assert.equal(row, '2026-11-01,Ann,"Lee, Jr",209,a@b.c,No,,,,Yes,"433 ""E"" Hwy 4",');
});

import { sellerUpdateText, onlineLine } from '../js/messages.js';
import { sellerStats, sellerUpdatesDue } from '../js/brief.js';

const today = '2026-10-27';
const sp = { id: 'p1', address: '433 E Highway 4, Murphys', status: 'listing', price: 799000, list_date: '2026-09-12', owner: 'sara',
  marketing: { listtrac: { views: 4102, last30: 1790, shares: 33, favorites: null, inquiries: 4, as_of: '2026-10-19' }, homes: { views: 96341, favorites: 12, as_of: '2026-10-19' } },
  portal_url: 'https://legacycalifornia.com/seller/tok' };
const sdata = {
  properties: [sp],
  events: [
    { property_id: 'p1', kind: 'showing', date: '2026-10-25' },
    { property_id: 'p1', kind: 'showing', date: '2026-10-01' },
    { property_id: 'p1', kind: 'showing', date: '2026-10-26', cancelled: true },
    { property_id: 'p1', kind: 'open', date: '2026-10-26' },
    { property_id: 'p1', kind: 'open', date: '2026-11-01', title: 'OH' }
  ],
  tours: [{ date: '2026-10-24', stops: [{ property_id: 'p1', shown: true }, { property_id: 'p2', shown: true }] }],
  notes: [
    { property_id: 'p1', text: 'Showing feedback: Loved the views, worried about the road', created_at: '2026-10-25T18:00:00Z' },
    { property_id: 'p1', text: 'Showing feedback: Too pricey · my buyer can go to 760', created_at: '2026-10-24T18:00:00Z' },
    { property_id: 'p1', text: 'Showing feedback: old', created_at: '2026-10-01T18:00:00Z' },
    { property_id: 'p1', text: 'Gate code changed', created_at: '2026-10-25T18:00:00Z' }
  ],
  visitors: [
    { property_id: 'p1', oh_date: '2026-10-26', first_name: 'Ann', has_agent: false, also_selling: true },
    { property_id: 'p1', oh_date: '2026-10-26', first_name: 'Bob', has_agent: true },
    { property_id: 'p1', oh_date: '2026-10-26', first_name: 'Cy', has_agent: false }
  ],
  dates: [{ property_id: 'p1', label: 'Price review', due: '2026-11-03', done: false }]
};

test('seller stats: this week, since listing, feedback, open house counts and what is next', () => {
  const st = sellerStats(sdata, 'p1', today);
  assert.equal(st.showingsWeek, 2, 'a showing appointment and our own shown stop; not the cancelled one');
  assert.equal(st.showingsTotal, 3);
  assert.equal(st.feedback.length, 2);
  assert.deepEqual(st.openHouse, { visitors: 3, unrepresented: 2, selling: 1, held: true });
  assert.deepEqual(st.next.map((x) => x.label), ['Open house', 'Price review']);
  assert.equal(st.dom, 45);
});

test('the seller update says it in a few lines, links the portal and never names a visitor or our buyer\'s note', () => {
  const t = sellerUpdateText(sp, sellerStats(sdata, 'p1', today), { seller: 'Jim Smith', profile: { full_name: 'Sara Cooper', brokerage: 'Legacy Properties', license: 'DRE 02141987' } });
  assert.match(t, /^Hi Jim, here is your weekly update on 433 E Highway 4\./);
  assert.match(t, /Showings: 2 this week, 3 since we listed\./);
  assert.match(t, /• Loved the views, worried about the road/);
  assert.match(t, /• Too pricey\n/);
  assert.doesNotMatch(t, /760|Ann|Bob|Cy\b/);
  assert.match(t, /Open house: 3 visitors, 2 without an agent, 1 also selling a home\./);
  assert.match(t, /Online \(ListTrac, Oct 19\): 1,790 views in the last 30 days, 33 shares, 4 inquiries\./);
  assert.doesNotMatch(t, /96,341/, 'one source, never both added or mixed');
  assert.match(t, /Listed at \$799,000 · 45 days on market\./);
  assert.match(t, /Coming up: Open house Sun, Nov 1 · Price review Tue, Nov 3\./);
  assert.match(t, /More numbers on your portal: https:\/\/legacycalifornia\.com\/seller\/tok/);
  assert.match(t, /Sara Cooper\nLegacy Properties · DRE 02141987$/);
});

test('a quiet week with nothing from a CRM still reads well', () => {
  const p = { id: 'q', address: '1 Quiet Ln', status: 'listing' };
  const t = sellerUpdateText(p, sellerStats({ properties: [p] }, 'q', today), { me: 'sara' });
  assert.match(t, /No showings this week\./);
  assert.doesNotMatch(t, /Online|portal|Open house|Coming up|undefined|null/);
  assert.equal(onlineLine({ homes: { views: 10, favorites: 1, as_of: '2026-10-19' } }), 'Online (Homes.com, Oct 19): 10 views, 1 favorite.');
});

test('seller updates are due on my listings not updated in 7 days', () => {
  const props = [
    { id: 'a', status: 'listing', owner: 'sara' },
    { id: 'b', status: 'listing', owner: 'sara', seller_update_at: '2026-10-24T10:00:00Z' },
    { id: 'c', status: 'listing', owner: 'sara', seller_update_at: '2026-10-19T10:00:00Z' },
    { id: 'd', status: 'listing', owner: 'james' },
    { id: 'e', status: 'escrow', owner: 'sara' }
  ];
  assert.deepEqual(sellerUpdatesDue(props, today, 'sara').map((p) => p.id), ['a', 'c']);
});

import { feedbackRequestText } from '../js/messages.js';
import { feedbackDue } from '../js/brief.js';

test('feedback from the agents who showed my listing: ask, then log, then gone', () => {
  const data = {
    properties: [{ id: 'm', address: '433 E Highway 4', status: 'listing', owner: 'sara' }, { id: 'o', address: '9 Oak', status: 'tour' }],
    events: [
      { id: 'a', property_id: 'm', kind: 'showing', date: '2026-10-26', showing_agent: 'Pat Lee' },
      { id: 'b', property_id: 'm', kind: 'showing', date: '2026-10-27', start_minutes: 540, minutes: 30, feedback_asked_at: 'x' },
      { id: 'c', property_id: 'm', kind: 'showing', date: '2026-10-27', start_minutes: 700 },
      { id: 'd', property_id: 'm', kind: 'showing', date: '2026-10-25', feedback_logged_at: 'x' },
      { id: 'e', property_id: 'o', kind: 'showing', date: '2026-10-26' },
      { id: 'f', property_id: 'm', kind: 'showing', date: '2026-10-10' }
    ]
  };
  const r = feedbackDue(data, '2026-10-27', 600, 'sara');
  assert.deepEqual(r.map((x) => [x.event.id, x.stage]), [['b', 'log'], ['a', 'ask']]);
  assert.match(feedbackRequestText({ agent: 'Pat Lee', address: '433 E Highway 4, Murphys', date: '2026-10-26', today: '2026-10-27', me: 'sara' }), /^Hi Pat, thank you for showing 433 E Highway 4 on Monday\. How did your buyers like it\?/);
});

// Seller updates past due (2026-10-28): 14+ days since the last one, or none
// ever sent on a listing live 14+ days. A new listing is due, not past due.
import { sellerUpdatesPastDue } from '../js/brief.js';
test('seller updates: past due only after a full extra week', () => {
  const today = '2026-10-28';
  const props = [
    { id: 'recent', status: 'listing', seller_update_at: '2026-10-25T10:00:00Z' },
    { id: 'due', status: 'listing', seller_update_at: '2026-10-19T10:00:00Z' },
    { id: 'late', status: 'listing', seller_update_at: '2026-10-10T10:00:00Z' },
    { id: 'newlist', status: 'listing', list_date: '2026-10-24' },
    { id: 'oldlist', status: 'listing', list_date: '2026-10-01' },
    { id: 'nodate', status: 'listing' }
  ];
  assert.deepEqual(sellerUpdatesPastDue(props, today).map((p) => p.id), ['late', 'oldlist']);
});

test('the status is called "Other agent\'s" and American spelling is used', async () => {
  const fs = await import('node:fs');
  const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(app, /tour: "Other agent's"/);
  assert.doesNotMatch(app, /'Showing \/ other agent'|Brand colour|'Cancelled'/);
});
