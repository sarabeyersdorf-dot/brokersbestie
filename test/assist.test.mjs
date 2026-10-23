import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sheetChanges, sheetExtras, sheetNoteText, actionPlan } from '../js/assist.js';
import { SHEET_SCHEMA } from '../api/read-sheet.js';
import { ASSIST_SCHEMA } from '../api/assist.js';

const sheet = {
  address: '433 E Highway 4', city: 'Murphys, CA', price: 799000, mls: '202601234', occupancy: 'O',
  beds: 3, baths: 2, sqft: 1850, lot: '2.3 acres', year_built: 1978, well: true, septic: true, hoa: 'None', solar: null,
  showing_notes: 'Call owner 2 hours ahead. Dog.', directions: null, remarks: 'Views of the valley.',
  codes: [{ kind: 'lockbox', label: 'Supra', code: null, where: 'Hose bib by the porch' }, { kind: 'gate', label: 'Gate', code: '2580', where: 'Left post' }],
  people: [{ name: 'Pat Lee', role: 'Listing agent', phone: '209-555-0101', email: null }],
  field_notes: ['Detached shop', 'Propane'] };

test('a sheet fills blanks and never ticks an overwrite', () => {
  const changes = sheetChanges(sheet, { address: '433 E Highway 4', price: 749000, mls: '' });
  const by = Object.fromEntries(changes.map((c) => [c.field, c]));
  assert.equal(by.address, undefined, 'same value is not offered');
  assert.equal(by.price.checked, false, 'a different price is offered unticked');
  assert.equal(by.price.current, 749000);
  assert.equal(by.mls.checked, true);
  assert.equal(by.well.checked, true);
  assert.equal(by.solar, undefined, 'null on the sheet is not offered');
});

test('a sheet does not add codes or people the property already has', () => {
  const x = sheetExtras(sheet, { access: [{ kind: 'gate', code: '2580' }], people: [{ name: 'pat lee' }] });
  assert.equal(x.codes.length, 1);
  assert.equal(x.codes[0].kind, 'lockbox');
  assert.equal(x.people.length, 0);
});

test('the field note keeps the facts the card has no box for', () => {
  const t = sheetNoteText(sheet);
  assert.match(t, /^MLS sheet/);
  assert.match(t, /3 bd · 2 ba · 1,850 sq ft · 2\.3 acres lot · built 1978/);
  assert.match(t, /• Detached shop/);
  assert.match(t, /Views of the valley/);
});

test('spoken actions become rows, and ask when the property is missing', () => {
  const today = '2026-10-23';
  assert.deepEqual(actionPlan({ type: 'task', text: 'Order the warranty', due: null, property_id: null }, { today }).row, { text: 'Order the warranty', due: today, property_id: null, done: false });
  const code = actionPlan({ type: 'code', code_kind: 'gate', code: '2580', where: 'Left post', property_id: 'p1' }, { today });
  assert.equal(code.table, 'access');
  assert.equal(code.row.code, '2580');
  assert.equal(code.row.label, 'Gate code');
  assert.match(actionPlan({ type: 'note', text: 'Shed goes', property_id: null }, { today }).error, /Which property/);
  assert.equal(actionPlan({ type: 'tour', stops: ['1143 Echo St', '324 Augusta Ct at 11'] }, { today }).plan, '1143 Echo St\n324 Augusta Ct at 11');
  assert.equal(actionPlan({ type: 'checkin', minutes: 60, name: 'New buyer' }, { today }).go, '#/safety');
  assert.ok(actionPlan({ type: 'unclear', summary: 'Which listing?' }, { today }).error);
});

// Structured output needs every object closed and every property listed as required.
function closed(schema, path = 'root') {
  if (schema.type === 'object' || (Array.isArray(schema.type) && schema.type.includes('object'))) {
    assert.equal(schema.additionalProperties, false, path);
    assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort(), path);
    for (const [k, v] of Object.entries(schema.properties)) closed(v, `${path}.${k}`);
  }
  if (schema.items) closed(schema.items, `${path}[]`);
}
test('the answer shapes Bestie asks for are strict', () => {
  closed(SHEET_SCHEMA);
  closed(ASSIST_SCHEMA);
});
