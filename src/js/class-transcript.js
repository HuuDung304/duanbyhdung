// Build the class transcript independently of the screen's selected year.
export function buildClassTranscript(students, semesters, grades, semesterGpa, yearGpa, fullName, birthYear) {
  const validScore = value => value !== '' && value !== null && value !== undefined
    && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 10;
  const completed = semesters.filter(({ subjects }) => subjects.length > 0 && students.length > 0
    && students.every(student => subjects.every(subject => validScore(grades[student.id]?.[subject.id]))));
  const completedNumbers = new Set(completed.map(item => item.semester));
  const headers = ['MÃ HỌC VIÊN', 'HỌ VÀ TÊN', 'LỚP', 'NĂM SINH'];
  for (const { semester } of completed) {
    headers.push(`ĐIỂM CÁC MÔN KỲ ${semester}`, `ĐIỂM TB KỲ ${semester}`);
    if (semester % 2 === 0 && completedNumbers.has(semester - 1)) headers.push(`ĐIỂM TB NĂM ${semester / 2}`);
  }
  const rows = students.map(student => {
    const row = [String(student.code || ''), student.name, student.class, birthYear(student.dob)];
    for (const { semester, subjects } of completed) {
      row.push(subjects.map(subject => `${fullName(subject)} (${Number(subject.credits) || 0} TC): ${Number(grades[student.id][subject.id]).toFixed(2)}`).join('\n'),
        Number(semesterGpa(student.id, semester).toFixed(2)));
      if (semester % 2 === 0 && completedNumbers.has(semester - 1)) row.push(Number(yearGpa(student.id, semester / 2).toFixed(2)));
    }
    return row;
  });
  return { headers, rows, completed };
}
