// Dependencies are injected by grades.js; this module does not import the application shell.
export function createGradeCalculations(context) {
  function calculateSemesterGPA(studentId, semester) {
    const student = context.AppState.students.find(s => s.id === studentId);
    const studentClass = student ? student.class : context.AppState.currentSheetClass;
    const studentGrades = context.AppState.grades[studentId] || {};
    const semSubjects = context.getSubjectsForClass(studentClass, semester);
    if (semSubjects.length === 0) return 0;

    let totalPoints = 0;
    let totalCredits = 0;
    semSubjects.forEach(s => {
      const score = studentGrades[s.id];
      if (score !== undefined && score !== null && score !== '' && !isNaN(score)) {
        totalPoints += Number(score) * s.credits;
        totalCredits += s.credits;
      }
    });
    return totalCredits > 0 ? (totalPoints / totalCredits) : 0;
  }

  function calculateSemesterGPA4(studentId, semester) {
    const student = context.AppState.students.find(s => s.id === studentId);
    const studentClass = student ? student.class : context.AppState.currentSheetClass;
    const studentGrades = context.AppState.grades[studentId] || {};
    const semSubjects = context.getSubjectsForClass(studentClass, semester);
    if (semSubjects.length === 0) return 0;

    let totalPoints4 = 0;
    let totalCredits = 0;
    semSubjects.forEach(s => {
      const score = studentGrades[s.id];
      if (score !== undefined && score !== null && score !== '' && !isNaN(score)) {
        const { scale4 } = getGradeLetterAndScale4(score);
        totalPoints4 += scale4 * s.credits;
        totalCredits += s.credits;
      }
    });
    return totalCredits > 0 ? (totalPoints4 / totalCredits) : 0;
  }

  function calculateAcademicYearGPA(studentId, yearNum = 1) {
    const student = context.AppState.students.find(s => s.id === studentId);
    const studentClass = student ? student.class : context.AppState.currentSheetClass;
    const studentGrades = context.AppState.grades[studentId] || {};
    const y = Number(yearNum) || 1;
    const sem1 = 2 * y - 1;
    const sem2 = 2 * y;
    const yearSubjects = [
      ...context.getSubjectsForClass(studentClass, sem1),
      ...context.getSubjectsForClass(studentClass, sem2)
    ];
    if (yearSubjects.length === 0) return 0;

    let totalPoints = 0;
    let totalCredits = 0;
    yearSubjects.forEach(s => {
      const score = studentGrades[s.id];
      if (score !== undefined && score !== null && score !== '' && !isNaN(score)) {
        totalPoints += Number(score) * s.credits;
        totalCredits += s.credits;
      }
    });
    return totalCredits > 0 ? (totalPoints / totalCredits) : 0;
  }

  function calculateAcademicYearGPA4(studentId, yearNum = 1) {
    const student = context.AppState.students.find(s => s.id === studentId);
    const studentClass = student ? student.class : context.AppState.currentSheetClass;
    const studentGrades = context.AppState.grades[studentId] || {};
    const y = Number(yearNum) || 1;
    const sem1 = 2 * y - 1;
    const sem2 = 2 * y;
    const yearSubjects = [
      ...context.getSubjectsForClass(studentClass, sem1),
      ...context.getSubjectsForClass(studentClass, sem2)
    ];
    if (yearSubjects.length === 0) return 0;

    let totalPoints4 = 0;
    let totalCredits = 0;
    yearSubjects.forEach(s => {
      const score = studentGrades[s.id];
      if (score !== undefined && score !== null && score !== '' && !isNaN(score)) {
        const { scale4 } = getGradeLetterAndScale4(score);
        totalPoints4 += scale4 * s.credits;
        totalCredits += s.credits;
      }
    });
    return totalCredits > 0 ? (totalPoints4 / totalCredits) : 0;
  }

  function calculateYearGPA(studentId) {
    const student = context.AppState.students.find(s => s.id === studentId);
    const studentClass = student ? student.class : context.AppState.currentSheetClass;
    const studentGrades = context.AppState.grades[studentId] || {};
    const applicableSubjects = context.getSubjectsForClass(studentClass);

    let totalPoints = 0;
    let totalCredits = 0;
    applicableSubjects.forEach(s => {
      const score = studentGrades[s.id];
      if (score !== undefined && score !== null && score !== '' && !isNaN(score)) {
        totalPoints += Number(score) * s.credits;
        totalCredits += s.credits;
      }
    });
    return totalCredits > 0 ? (totalPoints / totalCredits) : 0;
  }

  function calculateCourseGPA10(studentId) {
    return calculateYearGPA(studentId);
  }

  function getScale3FromScore10(score10) {
    if (score10 === undefined || score10 === null || score10 === '' || isNaN(score10)) return 0;
    return (Number(score10) / 10) * 3;
  }

  function calculateCourseGPA3(studentId) {
    return (calculateYearGPA(studentId) / 10) * 3;
  }

  function getSemesterCredits(semester, className = null) {
    return context.getSubjectsForClass(className, semester).reduce((sum, s) => sum + Number(s.credits || 0), 0);
  }

  function getTotalCourseCredits(className = 'OTQS1') {
    return context.getSubjectsForClass(className).reduce((sum, s) => sum + Number(s.credits || 0), 0);
  }


  const RANK_LEVELS = ['Xuất sắc', 'Giỏi', 'Khá', 'Trung bình khá', 'Trung bình', 'Yếu', 'Kém'];

  function getClassification(gpa) {
    const val = Number(gpa) || 0;
    if (val >= 9.0) return 'Xuất sắc';
    if (val >= 8.0) return 'Giỏi';
    if (val >= 7.0) return 'Khá';
    if (val >= 6.5) return 'Trung bình khá';
    if (val >= 5.5) return 'Trung bình';
    if (val >= 5.0) return 'Yếu';
    return 'Kém';
  }

  function getClassificationBadge(rank) {
    switch (rank) {
      case 'Xuất sắc':
        return '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 whitespace-nowrap">Xuất sắc</span>';
      case 'Giỏi':
        return '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 whitespace-nowrap">Giỏi</span>';
      case 'Khá':
        return '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">Khá</span>';
      case 'Trung bình khá':
        return '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-cyan-100 text-cyan-800 border border-cyan-300 whitespace-nowrap">Trung bình khá</span>';
      case 'Trung bình':
        return '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300 whitespace-nowrap">Trung bình</span>';
      case 'Yếu':
        return '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-orange-100 text-orange-800 border border-orange-300 whitespace-nowrap">Yếu</span>';
      default:
        return '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300 whitespace-nowrap">Kém</span>';
    }
  }

  function getDebtSubjects(studentId, semesterFilter = null, yearFilter = null) {
    const student = context.AppState.students.find(s => s.id === studentId);
    const studentClass = student ? student.class : context.AppState.currentSheetClass;
    const studentGrades = context.AppState.grades[studentId] || {};
    let subjs = context.getSubjectsForClass(studentClass);

    if (semesterFilter && semesterFilter !== 'all') {
      subjs = subjs.filter(s => Number(s.semester) === Number(semesterFilter));
    } else if (yearFilter && yearFilter !== 'all') {
      const y = Number(yearFilter);
      subjs = subjs.filter(s => Number(s.semester) === (2 * y - 1) || Number(s.semester) === (2 * y));
    }

    const debts = [];
    subjs.forEach(s => {
      const score = studentGrades[s.id];
      if (score !== undefined && score !== null && score !== '' && !isNaN(score) && Number(score) < 4.0) {
        debts.push({ subject: s, score: Number(score) });
      }
    });
    return debts;
  }

  function formatFailedSubjectItem(subject) {
    if (!subject) return '';
    const fullCourseName = context.getFullSubjectName(subject);
    return `${fullCourseName} (${subject.credits} TC)`;
  }


  function getGradeLetterAndScale4(score10) {
    if (score10 === undefined || score10 === null || isNaN(score10) || score10 === '') {
      return { letter: '-', scale4: 0, status: 'Chưa thi' };
    }
    const s = Number(score10);
    if (s >= 9.0) return { letter: 'A', scale4: 4.0, status: 'Đạt (Giỏi)' };
    if (s >= 8.0) return { letter: 'B+', scale4: 3.5, status: 'Đạt (Khá Giỏi)' };
    if (s >= 7.0) return { letter: 'B', scale4: 3.0, status: 'Đạt (Khá)' };
    if (s >= 6.5) return { letter: 'C+', scale4: 2.5, status: 'Đạt (TB Khá)' };
    if (s >= 5.5) return { letter: 'C', scale4: 2.0, status: 'Đạt (TB)' };
    if (s >= 5.0) return { letter: 'D+', scale4: 1.5, status: 'Đạt (TB Yếu)' };
    if (s >= 4.0) return { letter: 'D', scale4: 1.0, status: 'Đạt (Tối thiểu)' };
    return { letter: 'F', scale4: 0.0, status: 'Rớt môn (< 4.0)' };
  }

  function calculateCumulativeGPA4(studentId) {
    const student = context.AppState.students.find(s => s.id === studentId);
    const studentClass = student ? student.class : context.AppState.currentSheetClass;
    const studentGrades = context.AppState.grades[studentId] || {};
    const subjs = context.getSubjectsForClass(studentClass);

    let totalPoints = 0;
    let totalCredits = 0;
    subjs.forEach(sub => {
      const score = studentGrades[sub.id];
      if (score !== undefined && score !== null && score !== '' && !isNaN(score)) {
        const { scale4 } = getGradeLetterAndScale4(score);
        totalPoints += scale4 * sub.credits;
        totalCredits += sub.credits;
      }
    });
    return totalCredits > 0 ? (totalPoints / totalCredits) : 0;
  }

  function calculateCreditsPassed(studentId) {
    const student = context.AppState.students.find(s => s.id === studentId);
    const studentClass = student ? student.class : context.AppState.currentSheetClass;
    const studentGrades = context.AppState.grades[studentId] || {};
    const subjs = context.getSubjectsForClass(studentClass);

    let passedCredits = 0;
    subjs.forEach(sub => {
      const score = studentGrades[sub.id];
      if (score !== undefined && score !== null && score !== '' && !isNaN(score) && Number(score) >= 4.0) {
        passedCredits += sub.credits;
      }
    });
    return passedCredits;
  }


  return { calculateSemesterGPA, calculateSemesterGPA4, calculateAcademicYearGPA, calculateAcademicYearGPA4, calculateYearGPA, calculateCourseGPA10, getScale3FromScore10, calculateCourseGPA3, getSemesterCredits, getTotalCourseCredits, RANK_LEVELS, getClassification, getClassificationBadge, getDebtSubjects, formatFailedSubjectItem, getGradeLetterAndScale4, calculateCumulativeGPA4, calculateCreditsPassed };
}
