import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSearchText } from '../src/js/search-text.js';

test('Vietnamese search accepts accents, case, student codes and empty values', () => {
  assert.equal(normalizeSearchText('  Đề Tài Nguyễn An  '), 'de tai nguyen an');
  assert.equal(normalizeSearchText('HV001'), 'hv001');
  assert.equal(normalizeSearchText(null), '');
  assert.equal(normalizeSearchText(0), '0');
});
