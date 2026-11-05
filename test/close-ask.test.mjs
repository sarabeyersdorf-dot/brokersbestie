// An old closing asks "Did it close?" instead of sitting red (Sara, 2026-10-31:
// two July closings read "103 days past · confirm it happened" in red on Today).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { asksDidItClose, CLOSE_ASK_DAYS } from '../js/brief.js';

const today = '2026-10-31';
test('a closing more than 14 days past asks; a fresher one keeps the overdue look', () => {
  assert.equal(CLOSE_ASK_DAYS, 14);
  assert.equal(asksDidItClose({ label: 'Close of escrow', due: '2026-07-20' }, today), true);
  assert.equal(asksDidItClose({ label: 'COE', due: '2026-10-16' }, today), true, '15 days');
  assert.equal(asksDidItClose({ label: 'Close of escrow', due: '2026-10-17' }, today), false, '14 days is still overdue');
  assert.equal(asksDidItClose({ label: 'Close of escrow', due: '2026-11-05' }, today), false, 'not yet due');
});
test('other deadlines, and ticked closings, never ask', () => {
  assert.equal(asksDidItClose({ label: 'Inspection contingency', due: '2026-07-20' }, today), false);
  assert.equal(asksDidItClose({ label: 'Loan contingency', due: '2026-01-01' }, today), false);
  assert.equal(asksDidItClose({ label: 'Close of escrow', due: '2026-07-20', done: true }, today), false);
  assert.equal(asksDidItClose(null, today), false);
});
test('Today shows it as a calm row with Yes, it closed / Not yet, hidden 7 days on this phone', () => {
  const s = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(s, /asksDidItClose\(d, t\)/);
  assert.match(s, /ask: true[^\n]*late: false/, 'never late, so never the one red item');
  assert.match(s, /Yes, it closed/);
  assert.match(s, /Not yet/);
  assert.match(s, /7 \* 86400e3/);
  assert.match(s, /function closeAskRow[\s\S]{0,200}ktag\('closing', false\)/);
  // Both lists that draw to-dos know the row, and both wirings answer it.
  assert.ok((s.match(/closeAskRow\(t\)/g) || []).length >= 2);
  assert.ok((s.match(/wireCloseAsk\(root\)/g) || []).length >= 2);
});
