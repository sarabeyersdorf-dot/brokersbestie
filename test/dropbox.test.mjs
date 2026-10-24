import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { typeFromName } from '../js/dropbox.js';

test('a Dropbox file gets the right type from its name', () => {
  assert.equal(typeFromName('MLS 123 Main.PDF'), 'application/pdf');
  assert.equal(typeFromName('sheet.jpeg'), 'image/jpeg');
  assert.equal(typeFromName('IMG_1.HEIC'), 'image/heic');
});

test('the service worker caches dropbox.js and the sheet screen offers it', () => {
  assert.match(fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), /'\.\/js\/dropbox\.js'/);
  assert.match(fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8'), /id="dbx">\$\{raw\(DBX_ICON\)\}From Dropbox/);
});
