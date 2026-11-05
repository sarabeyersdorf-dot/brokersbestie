// /sms is Twilio's "opt-in proof" (2026-11-05). The texts it shows must be the
// texts the server really sends, word for word.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { inviteText, acceptedText, HELP_TEXT, alertText } from '../supabase/functions/reminders/safety.js';

const page = fs.readFileSync(new URL('../sms.html', import.meta.url), 'utf8').replace(/&amp;/g, '&');
const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

test('/sms shows the real confirmation, YES reply, HELP reply and alert texts', () => {
  assert.ok(page.includes(inviteText('Jane Smith')), 'invite');
  assert.ok(page.includes(acceptedText('Jane Smith')), 'yes reply');
  assert.ok(page.includes(HELP_TEXT), 'help');
  assert.ok(page.includes(alertText({ place: '123 Main St, Angels Camp, CA', meeting_name: 'Tom', agent_name: 'Jane Smith', lat: 38.0683, lng: -120.5397 }, { overdue: true })), 'alert');
});

test('/sms has the screenshots, the disclosure, policy links, and is routed', () => {
  for (const f of ['sms/sms-optin-form.png', 'sms/sms-optin-pending.png', 'sms/sms-optin-accepted.png']) {
    assert.ok(page.includes(f), f);
    assert.ok(fs.existsSync(new URL('../' + f, import.meta.url)), f + ' exists');
  }
  assert.ok(page.includes("We'll text your contact once to confirm. They can reply STOP anytime."));
  assert.match(page, /privacy\.html#sms/);
  assert.match(page, /terms\.html#sms/);
  assert.match(page, /never shared with or sold to third parties/);
  assert.ok(vercel.rewrites.some((r) => r.source === '/sms' && r.destination === '/sms.html'));
});

test('privacy and terms carry the SMS sections', () => {
  const privacy = fs.readFileSync(new URL('../privacy.html', import.meta.url), 'utf8');
  const terms = fs.readFileSync(new URL('../terms.html', import.meta.url), 'utf8');
  assert.match(privacy, /id="sms"/);
  assert.match(privacy, /Mobile numbers and SMS consent are never shared with or sold to third parties/);
  assert.match(terms, /id="sms"/);
  assert.match(terms, /STOP/);
  assert.match(terms, /HELP/);
  assert.match(terms, /Message and data rates may apply/);
});

test('the phone screen says it before the contact is texted', () => {
  const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.ok(app.includes("We\\'ll text your contact once to confirm. They can reply STOP anytime."));
  assert.match(app, /inviteContact\(/);
});
