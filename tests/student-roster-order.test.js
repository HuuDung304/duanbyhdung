import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortStudentsForRoster } from '../src/js/student-roster-order.js';

test('roster orders classes, then Vietnamese given names, without changing source data', () => {
  const input = [
    { code: '5', class: 'XMCB', name: 'Nguyễn An' },
    { code: '3', class: 'OTQS1', name: 'Trần Cường' },
    { code: '4', class: 'TTG1', name: 'Lê Bình' },
    { code: '2', class: 'OTQS1', name: 'Đỗ Bình' },
    { code: '1', class: 'OTQS1', name: 'Phạm An' },
    { code: '6', class: 'OTQS2', name: 'Võ Dũng' }
  ];
  assert.deepEqual(sortStudentsForRoster(input).map(student => student.code), ['1','2','3','6','4','5']);
  assert.equal(input[0].code, '5');
});
