// Legacy VM fixtures isolate functions with custom browser/database mocks.
// Resolve their source from the implementation modules after the facade split.
import { readFileSync } from 'node:fs';
const base = new URL('../src/js/', import.meta.url);
const read = name => readFileSync(new URL(name, base), 'utf8');
export function databaseFixtureSource() {
  return ['client','mappers','batches','repository','realtime','import-transaction']
    .map(name => read(`database/${name}.js`).replace(/^import .*;\n/gm, '')).join('\n');
}
export function academicFixtureSource() {
  return ['academic/calculations.js','academic/transcript.js','reports/statistics.js','reports/dashboard.js','reports/exports.js']
    .map(name => {
      let source = read(name);
      source = source.slice(source.indexOf('(context) {') + '(context) {'.length, source.lastIndexOf('\n  return {'));
      return source.replace(/^  /gm,'').replace(/\bcontext\./g,'').replace(/^(const|(?:async )?function) /gm,'export $1 ');
    }).join('\n') + '\n' + read('grades.js');
}
