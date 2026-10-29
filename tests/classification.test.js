import { academicFixtureSource } from './module-source-helper.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = academicFixtureSource();
function declaration(name) {
  const start = source.search(new RegExp(`^export (?:const|(?:async )?function) ${name}\\b`, 'm'));
  assert.ok(start >= 0, name);
  const next = source.indexOf('\nexport ', start + 1);
  return source.slice(start, next < 0 ? undefined : next).replace(/^export /gm, '');
}
function fixture() {
  const scores = [9, 8, 7, 6.5, 5.5, 5, 4, 3.99];
  const students = scores.map((gpa, i) => ({ id: `hv${i}`, code: `HV${i}`, name: `Học viên ${i}`, class: 'OTQS1', gpa }));
  const subjects = [{ id: 'math', name: 'Toán', credits: 3, semester: 1 }];
  const context = vm.createContext({ escapeHTML: value => String(value),
    AppState: { students, grades: Object.fromEntries(students.map(student => [student.id, { math: student.gpa }])), dashboardFilters: {}, role: 'admin' },
    DEFAULT_CLASSES: ['OTQS1'],
    getCurrentUserClassScope: () => null,
    getSubjectsForClass: (cls, sem) => !sem || sem === 1 ? subjects : [],
    getScopedStudents: () => students,
    calculateYearGPA: id => students.find(student => student.id === id).gpa,
    calculateSemesterGPA: id => students.find(student => student.id === id).gpa,
    calculateAcademicYearGPA: id => students.find(student => student.id === id).gpa,
    getFullSubjectName: subject => subject.name || subject,
  });
  vm.runInContext(['RANK_LEVELS', 'getClassification', 'getClassificationBadge', 'getDebtSubjects',
    'formatFailedSubjectItem', 'RANK_META', 'REPORT_RANK_META', 'REPORT_RANK_LEVELS', 'getReportClassification', 'computeTimeframeAcademicStats', 'buildAllYearsBreakdownStats', 'computeReportAcademicStats', 'buildReportYearsBreakdownStats', 'exportReportExcel'].map(declaration).join('\n'), context);
  return { context, students };
}

test('classifies every requested boundary without rounding across thresholds', () => {
  const { context } = fixture();
  for (const [value, expected] of [[10,'Xuất sắc'],[9,'Xuất sắc'],[8.99,'Giỏi'],[8.5,'Giỏi'],[8,'Giỏi'],[7.99,'Khá'],[7,'Khá'],[6.99,'Trung bình khá'],[6.5,'Trung bình khá'],[6.49,'Trung bình'],[5.5,'Trung bình'],[5.49,'Yếu'],[5,'Yếu'],[4.99,'Kém'],[4,'Kém'],[3.99,'Kém'],[8.999,'Giỏi']]) {
    assert.equal(context.getClassification(value), expected, String(value));
    assert.ok(context.getClassificationBadge(expected).includes(expected));
  }
});

test('keeps all seven ranks in overall, class and semester/year statistics; only scores below 4 fail', () => {
  const { context, students } = fixture();
  for (const mode of ['course', 'year', 'semester']) {
    const stats = context.computeTimeframeAcademicStats(students, mode, 1, 1);
    assert.equal(Object.keys(stats.rankCounts).length, 7);
    assert.equal(stats.rankCounts['Trung bình khá'], 1);
    assert.equal(stats.rankCounts['Yếu'], 1);
    assert.equal(stats.rankCounts['Kém'], 2);
    assert.equal(stats.classStats.OTQS1.rankCounts['Kém'], 2);
    assert.equal(Object.values(stats.rankCounts).reduce((sum, count) => sum + count, 0), 8);
    assert.equal(stats.failedCourseInstances, 1);
    assert.equal(stats.passedCourseInstances, 7);
    assert.equal(stats.rankDebtStudents['Kém'], 1);
  }
  assert.equal(context.getDebtSubjects('hv6').length, 0); // 4.00
  assert.equal(context.getDebtSubjects('hv7')[0].score, 3.99);
  context.AppState.grades.hv7.math = '';
  assert.equal(context.getDebtSubjects('hv7').length, 0);
});

test('Excel report exports seven rank columns with aligned data and correct fail count', () => {
  const { context } = fixture();
  let workbook;
  context.XLSX = {
    utils: {
      aoa_to_sheet: rows => ({ rows }), book_new: () => ({ sheets: {} }),
      book_append_sheet: (book, sheet, name) => { book.sheets[name] = sheet; },
    },
    writeFile: book => { workbook = book; },
  };
  context.writeReportWorkbook = book => { workbook = book; };
  context.exportReportExcel();
  const sheet = workbook.sheets.Bang_2_Ty_Le_Nam_Hoc_Ky;
  assert.equal(sheet.rows[4].length, 15);
  assert.ok(sheet.rows[4].includes('Trung bình khá (SL / %)'));
  assert.ok(sheet.rows[4].includes('Kém (SL / %)'));
  assert.equal(sheet.rows[5].length, 15);
  assert.equal(sheet.rows[5][9], '2 (25.0%)');
  assert.equal(sheet['!cols'].length, 15);
});


test('manual score editing preserves 3.99 instead of rounding it into a passing 4.0', async () => {
  const { context } = fixture();
  let saved;
  Object.assign(context, {
    canUserEditCurrentSheet: () => true, showToast() {}, renderSpreadsheet() {}, updateAllViews() {}, logAuditTrail() {},
    upsertGradeToSupabase: async (student, subject, score) => { saved = score; },
  });
  vm.runInContext(declaration('handleGradeChange'), context);
  const input = { value: '3,99', dataset: { student: 'hv0', subject: 'math', originalVal: '' } };
  await context.handleGradeChange(input);
  assert.equal(saved, 3.99);
  assert.equal(input.value, '3.99');
  assert.equal(context.getDebtSubjects('hv0').length, 1);
});


test('preserves the latest GitHub change to the A grade threshold at 9.0', () => {
  const { context } = fixture();
  vm.runInContext(declaration('getGradeLetterAndScale4'), context);
  assert.equal(context.getGradeLetterAndScale4(9).letter, 'A');
  assert.equal(context.getGradeLetterAndScale4(8.99).letter, 'B+');
});


test('report policy shares all seven exact boundaries and keeps per-class/year totals and the 4.0 failure boundary', () => {
  const { context, students } = fixture();
  for (const [score, rank] of [[9,'Xuất sắc'],[8.99,'Giỏi'],[8.5,'Giỏi'],[8,'Giỏi'],[7.99,'Khá'],[7,'Khá'],[6.99,'Trung bình khá'],[6.5,'Trung bình khá'],[6.49,'Trung bình'],[5.5,'Trung bình'],[5.49,'Yếu'],[5,'Yếu'],[4.99,'Kém'],[4,'Kém'],[3.99,'Kém']]) assert.equal(context.getReportClassification(score),rank);
  const report = context.computeReportAcademicStats(students);
  assert.equal(Object.keys(report.rankCounts).length,7);
  assert.equal(report.rankCounts['Trung bình'],1);
  assert.equal(report.rankCounts['Yếu'],1);
  assert.equal(report.failedCourseInstances,1);
  assert.equal(report.passedCourseInstances,7);
  const years = context.buildReportYearsBreakdownStats(students);
  assert.equal(years.length,5);
  for(const year of years) for(const stats of [year.hk1,year.hk2,year.fullYear]) assert.equal(Object.keys(stats.rankCounts).length,7);
});

test('unit annual export uses the selected year semesters and annual GPA, including year 5', () => {
  const { context } = fixture();
  let workbook;
  const debtYears = [];
  Object.assign(context, {
    getScopedStudents: () => [{ id: 's1', code: 'HV001', name: 'Test', class: 'OTQS1' }],
    calculateSemesterGPA: (id, semester) => semester / 2,
    calculateAcademicYearGPA: (id, year) => year + 4,
    getDebtSubjects: (id, semester, year) => { assert.equal(semester, null); debtYears.push(year); return []; },
    formatVN: () => '',
    writeReportWorkbook: book => { workbook = book; },
    XLSX: { utils: { aoa_to_sheet: rows => ({ rows }), book_new: () => ({ sheets: {} }), book_append_sheet: (book, sheet, name) => { book.sheets[name] = sheet; } } },
  });
  vm.runInContext(declaration('exportMasterExcel'), context);
  for (const year of [1, 2, 5]) {
    context.AppState.masterFilters = { year };
    context.exportMasterExcel();
    const rows = workbook.sheets.Tong_Hop_Dai_Doi.rows;
    assert.equal(rows[3][8], 'ĐTB Cả Năm');
    assert.equal(rows[4][6], ((year * 2 - 1) / 2).toFixed(2));
    assert.equal(rows[4][7], year.toFixed(2));
    assert.equal(rows[4][8], (year + 4).toFixed(2));
    assert.equal(debtYears.at(-1), year);
  }
});
