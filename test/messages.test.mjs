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
