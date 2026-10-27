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
