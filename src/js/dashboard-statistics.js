// Pure presentation data shared by the dashboard table and its Excel downloads.
export function studentBirthYear(value) {
  const text = String(value ?? '').trim();
  if (/^\d{4}$/.test(text)) return Number(text);
  const iso = text.match(/^(\d{4})[-/.]\d{1,2}[-/.]\d{1,2}(?:T.*)?$/);
  const vn = text.match(/^\d{1,2}[-/.]\d{1,2}[-/.](\d{4})$/);
  return iso || vn ? Number((iso || vn)[1]) : '';
}
export function collectLanguageStatistics(students, languages, standard, evaluate, classes) {
  const roster = students.map(student => {
    const level = student.currentLangLevel || languages[student.id]?.currentLevel || 'Chưa đạt';
    return { student, level, passed: evaluate(level, standard).isPassed };
  });
  // Stable grouping: every passing cadet precedes every nonpassing cadet.
  roster.sort((a, b) => Number(b.passed) - Number(a.passed)
    || classes.indexOf(a.student.class) - classes.indexOf(b.student.class)
    || String(a.student.name).localeCompare(String(b.student.name), 'vi')
    || String(a.student.code).localeCompare(String(b.student.code), 'vi'));
  const rows = classes.map(className => {
    const members = roster.filter(item => item.student.class === className);
    const total = members.length, passed = members.filter(item => item.passed).length;
    const notPassed = total - passed;
    return { className, total, passed, notPassed, passedRate: total ? passed * 100 / total : 0, notPassedRate: total ? notPassed * 100 / total : 0 };
  });
  return { rows, roster };
}
export function failedStudentExportRows(debts, fullSubjectName) {
  return [...debts].sort((a, b) => String(a.student.class).localeCompare(String(b.student.class), 'vi')
    || String(a.student.name).localeCompare(String(b.student.name), 'vi')).map(item => [
      item.student.code, item.student.name, studentBirthYear(item.student.dob), item.student.class,
      item.debts.map(debt => `${fullSubjectName(debt.subject)} (${Number(debt.subject.credits) || 0} tín chỉ)`).join('\n'),
      item.debts.reduce((sum, debt) => sum + (Number(debt.subject.credits) || 0), 0)
    ]);
}
