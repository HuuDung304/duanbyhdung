import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHTML } from '../src/js/safe-html.js';
test('data escaping covers HTML delimiters and both attribute quotes, including null values', () => {
 assert.equal(escapeHTML('<img src="x" onerror=\'bad()\'>&'), '&lt;img src=&quot;x&quot; onerror=&#39;bad()&#39;&gt;&amp;');
 assert.equal(escapeHTML(null),'');assert.equal(escapeHTML(undefined),'');assert.equal(escapeHTML('Nguyễn Hữu Dũng'),'Nguyễn Hữu Dũng');assert.equal(escapeHTML(0),'0');
});
