// Build the class transcript independently of the screen's selected year.
export function buildClassTranscript(students, semesters, grades, semesterGpa, yearGpa, fullName, birthDate) {
  const validScore = value => String(value ?? '').trim() !== '' && value !== null && value !== undefined
    && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 10;
  const completed = semesters.filter(({ subjects }) => subjects.length > 0 && students.length > 0
    && students.some(student => subjects.some(subject => validScore(grades[student.id]?.[subject.id]))));
  const lastSemesterByYear = new Map(completed.map(item => [Math.ceil(item.semester / 2), item.semester]));
  const hasYearEnd = semester => lastSemesterByYear.get(Math.ceil(semester / 2)) === semester;
  const headers = ['STT', 'MÃ HỌC VIÊN', 'HỌ VÀ TÊN', 'LỚP', 'NGÀY THÁNG NĂM SINH'];
  const groups = [...headers], credits = headers.map(() => '');
  const merges = headers.map((_, c) => ({ s: { r: 0, c }, e: { r: 2, c } }));
  for (const { semester, subjects } of completed) {
    const start = headers.length;
    for (const subject of subjects) {
      headers.push(fullName(subject)); groups.push(''); credits.push(Number(subject.credits) || 0);
    }
    headers.push(`ĐIỂM TB KỲ ${semester}`); groups.push(''); credits.push('');
    groups[start] = `HỌC KỲ ${semester}`;
    merges.push({ s: { r: 0, c: start }, e: { r: 0, c: headers.length - 1 } });
    merges.push({ s: { r: 1, c: headers.length - 1 }, e: { r: 2, c: headers.length - 1 } });
    if (hasYearEnd(semester)) {
      const c = headers.length;
      headers.push(`ĐIỂM TB NĂM ${Math.ceil(semester / 2)}`); groups.push(`ĐIỂM TB NĂM ${Math.ceil(semester / 2)}`); credits.push('');
      merges.push({ s: { r: 0, c }, e: { r: 2, c } });
    }
  }
  const notesColumn = headers.length;
  headers.push('GHI CHÚ'); groups.push('GHI CHÚ'); credits.push('');
  merges.push({ s: { r: 0, c: notesColumn }, e: { r: 2, c: notesColumn } });
  const headerRows = [groups, headers.map((value, index) => index < 5 || value === 'GHI CHÚ' || value.startsWith('ĐIỂM TB NĂM') ? '' : value), credits];
  const rows = students.map((student, index) => {
    const row = [index + 1, String(student.code || ''), student.name, student.class, birthDate(student.dob)];
    for (const { semester, subjects } of completed) {
      const scores = grades[student.id] || {};
      row.push(...subjects.map(subject => validScore(scores[subject.id]) ? Number(scores[subject.id]) : ''),
        subjects.some(subject => validScore(scores[subject.id])) ? Number(semesterGpa(student.id, semester).toFixed(2)) : '');
      if (hasYearEnd(semester)) row.push(completed.some(item => Math.ceil(item.semester / 2) === Math.ceil(semester / 2) && item.subjects.some(subject => validScore(scores[subject.id])))
        ? Number(yearGpa(student.id, Math.ceil(semester / 2)).toFixed(2)) : '');
    }
    row.push('');
    return row;
  });
  return { headers, headerRows, merges, rows, completed };
}
