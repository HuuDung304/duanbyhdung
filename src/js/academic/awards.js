const hasScore = value => value !== null && value !== undefined && String(value).trim() !== ''
  && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 10;

export function academicAwardLabel(average, kind) {
  if (kind === 'scholarships') return average >= 9 ? 'Học bổng Lê Quý Đôn' : average >= 8.5 ? 'Học bổng loại A' : average >= 8 ? 'Học bổng loại B' : '';
  return average >= 9 ? 'Học viên xuất sắc' : average >= 8 ? 'Học viên học giỏi' : average >= 7 ? 'Học viên học tốt' : '';
}

// Pick a single current period within the chosen scope. Never fall back to an
// older personal period for a student who has no scores in that current period.
export function buildAcademicAwards({ students, grades, subjectsForClass, languageStatus, scale4, kind }) {
  let latestSemester = 0;
  const offerings = new Map();
  for (const student of students) {
    if (!offerings.has(student.class)) offerings.set(student.class, subjectsForClass(student.class));
    for (const subject of offerings.get(student.class)) {
      const semester = Number(subject.semester);
      if (Number.isInteger(semester) && semester >= 1 && semester <= 10 && hasScore(grades[student.id]?.[subject.id])) latestSemester = Math.max(latestSemester, semester);
    }
  }
  const year = Math.ceil(latestSemester / 2), qualified = [], discretionary = [];
  for (const student of students) {
    if (!latestSemester) break;
    const scores = grades[student.id] || {};
    const scored = offerings.get(student.class).filter(subject => hasScore(scores[subject.id]) &&
      (kind === 'scholarships' ? Number(subject.semester) === latestSemester : Math.ceil(Number(subject.semester) / 2) === year));
    const credited = scored.filter(subject => Number(subject.credits) > 0);
    const credits = credited.reduce((sum, subject) => sum + Number(subject.credits), 0);
    if (!credits) continue;
    const average = credited.reduce((sum, subject) => sum + Number(scores[subject.id]) * Number(subject.credits), 0) / credits;
    const average4 = credited.reduce((sum, subject) => sum + scale4(Number(scores[subject.id])) * Number(subject.credits), 0) / credits;
    const language = languageStatus(student);
    if (!language.isPassed || scored.some(subject => Number(subject.credits) === 0 && Number(scores[subject.id]) < 4)) continue;
    const belowSeven = credited.filter(subject => Number(scores[subject.id]) < 7);
    const award = academicAwardLabel(average, kind);
    if (!award) continue;
    const record = { student, award, average, average4, language: language.actualLevel, belowSeven: belowSeven.map(subject => ({ subject, score: Number(scores[subject.id]) })) };
    if (!belowSeven.length) qualified.push(record);
    else if (kind === 'honors' && average >= 8) discretionary.push(record);
  }
  const compare = (a, b) => b.average - a.average || String(a.student.code).localeCompare(String(b.student.code), 'vi');
  return { latestSemester, year, qualified: qualified.sort(compare), discretionary: discretionary.sort(compare) };
}
