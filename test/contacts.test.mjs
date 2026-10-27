import test from 'node:test';
import assert from 'node:assert/strict';
import { parseContacts, parseCsv, planImport, kindFrom, columnsOf } from '../js/contacts.js';

test('a Google Contacts style CSV: columns found by their header words', () => {
  const csv = 'Given Name,Family Name,Organization 1 - Name,E-mail 1 - Value,Phone 1 - Value,Notes\nAnn,Lee,Lee Title,ANN@x.com,(209) 555-0101,"likes ranch, horses"\n';
  const [c] = parseContacts(csv, 'contacts.csv');
  assert.equal(c.name, 'Ann Lee');
  assert.equal(c.email, 'ann@x.com');
  assert.equal(c.phone, '(209) 555-0101');
  assert.equal(c.company, 'Lee Title');
  assert.equal(c.notes, 'likes ranch, horses');
});

test('quoted cells keep commas and line breaks; a BOM and blank lines are ignored', () => {
  const rows = parseCsv('﻿Name,Notes\r\n"Smith, Jo","two\nlines"\r\n\r\n');
  assert.deepEqual(rows, [['Name', 'Notes'], ['Smith, Jo', 'two\nlines']]);
});

test('a semicolon CSV (European Excel) works too', () => {
  const [c] = parseContacts('Name;Email\nBo Ray;bo@x.com\n');
  assert.equal(c.name, 'Bo Ray');
  assert.equal(c.email, 'bo@x.com');
});

test('a CRM export: Stage words become a kind', () => {
  const list = parseContacts('Name,Phone,Stage\nA,2095550001,Past Client\nB,2095550002,Lead\nC,2095550003,Sphere\nD,2095550004,Lender\n');
  assert.deepEqual(list.map((c) => c.kind), ['client', 'lead', 'sphere', 'vendor']);
  assert.equal(kindFrom(''), 'lead');
  assert.equal(columnsOf(['First Name', 'Last Name', 'Mobile Phone', 'Home Phone']).phone, 2, 'a mobile number is preferred');
});

test('a phone vCard: FN, the cell number, ORG, folded lines', () => {
  const vcf = 'BEGIN:VCARD\r\nVERSION:3.0\r\nN:Cooper;Sara;;;\r\nFN:Sara Cooper\r\nORG:Legacy Properties;\r\nTEL;type=HOME:209-555-0000\r\nTEL;type=CELL:209-555-1111\r\nEMAIL;type=INTERNET:sara@\r\n example.com\r\nEND:VCARD\r\nBEGIN:VCARD\r\nN:Ray;Bo\r\nTEL:2095552222\r\nEND:VCARD\r\n';
  const [a, b] = parseContacts(vcf, 'Contacts.vcf');
  assert.equal(a.name, 'Sara Cooper');
  assert.equal(a.phone, '209-555-1111');
  assert.equal(a.company, 'Legacy Properties');
  assert.equal(a.email, 'sara@example.com');
  assert.equal(b.name, 'Bo Ray', 'no FN: the N field is used');
});

test('already in Contacts (same phone or email) or twice in the file -> skipped', () => {
  const existing = [{ name: 'Ann', phone: '+1 (209) 555-0101' }];
  const { add, same } = planImport([
    { name: 'Ann Lee', phone: '2095550101' },
    { name: 'Bo', email: 'BO@x.com' },
    { name: 'Bo Ray', email: 'bo@x.com' },
    { name: 'Cy', phone: '' }
  ], existing);
  assert.deepEqual(add.map((c) => c.name), ['Bo', 'Cy']);
  assert.equal(same.length, 2);
});
