// Dependencies are injected by grades.js; this module does not import the application shell.
export function createReportStatistics(context) {
  const RANK_META = [
    { name: 'Xuất sắc', standard: '9.00 ≤ ĐTB ≤ 10.00', desc: 'Đạt danh hiệu Học viên Xuất sắc / Chiến sĩ thi đua', badge: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    { name: 'Giỏi', standard: '8.00 ≤ ĐTB < 9.00', desc: 'Đạt danh hiệu Học viên Giỏi tiêu biểu', badge: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    { name: 'Khá', standard: '7.00 ≤ ĐTB < 8.00', desc: 'Học lực vững chắc, hoàn thành tốt nhiệm vụ', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    { name: 'Trung bình khá', standard: '6.50 ≤ ĐTB < 7.00', desc: 'Cần tiếp tục củng cố kiến thức và nâng cao kết quả học tập', badge: 'bg-cyan-100 text-cyan-900 border-cyan-300' },
    { name: 'Trung bình', standard: '5.50 ≤ ĐTB < 6.50', desc: 'Đạt yêu cầu, cần tăng cường tự học nâng cao điểm số', badge: 'bg-amber-100 text-amber-900 border-amber-300' },
    { name: 'Yếu', standard: '5.00 ≤ ĐTB < 5.50', desc: 'Cần tăng cường ôn tập để nâng cao kết quả', badge: 'bg-orange-100 text-orange-900 border-orange-300' },
    { name: 'Kém', standard: 'ĐTB < 5.00', desc: 'Cần bồi dưỡng; chỉ môn dưới 4.00 mới tính là rớt', badge: 'bg-rose-100 text-rose-900 border-rose-300' }
  ];

  // All screens and exports share the same seven-level classification policy.
  const REPORT_RANK_META = RANK_META;
  const REPORT_RANK_LEVELS = REPORT_RANK_META.map(item => item.name);
  function getReportClassification(score) {
    return context.getClassification(score);
  }

  /**
   * Tính toán toàn diện thống kê học lực 7 mức (Xuất sắc, Giỏi, Khá, Trung bình khá, Trung bình, Yếu, Kém),
   * Tỷ lệ đạt/rớt học phần, Tổng số học viên rớt môn, Tổng số lượt rớt và Danh sách chi tiết môn rớt
   * theo từng mốc thời gian:
   * - mode = 'semester' : Theo Học kỳ (HK1 -> HK10)
   * - mode = 'year'     : Theo Năm học (Năm 1 -> Năm 5)
   * - mode = 'course'   : Từ đầu khóa đến nay (Tích lũy toàn khóa)
   */
  function computeTimeframeAcademicStats(studentsList = [], mode = 'course', semester = 1, year = 1, policy = 'academic') {
    const levels = policy === 'report' ? REPORT_RANK_LEVELS : context.RANK_LEVELS;
    const classify = policy === 'report' ? getReportClassification : context.getClassification;
    const semNum = Number(semester) || 1;
    const yearNum = Number(year) || 1;
    const totalCadets = Array.isArray(studentsList) ? studentsList.length : 0;

    const rankCounts = Object.fromEntries(levels.map(rank => [rank, 0]));

    const rankDebtStudents = Object.fromEntries(levels.map(rank => [rank, 0]));

    const rankFailInstances = Object.fromEntries(levels.map(rank => [rank, 0]));

    const classScope = context.getCurrentUserClassScope();
    const visibleClasses = classScope ? [classScope] : context.DEFAULT_CLASSES;
    const classStats = {};
    visibleClasses.forEach(c => {
      classStats[c] = {
        count: 0,
        totalGpa: 0,
        xs: 0,
        gioi: 0,
        kha: 0,
        tbk: 0,
        tb: 0,
        kem: 0,
        rankCounts: Object.fromEntries(levels.map(rank => [rank, 0])),
        yeu: 0,
        passedCourses: 0,
        failedCourses: 0,
        totalGradedCourses: 0,
        debtStudents: 0,
        totalFails: 0
      };
    });

    let totalGpaSum = 0;
    let goodCount = 0; // Xuất sắc + Giỏi
    let khaGioiXsCount = 0; // Xuất sắc + Giỏi + Khá
    let debtStudentCount = 0;
    let totalDebtFailsCount = 0;
    let passedCourseInstances = 0;
    let failedCourseInstances = 0;
    let totalGradedCourseInstances = 0;

    const debtCadetsList = [];
    const failedCourseDetailsList = [];

    studentsList.forEach(s => {
      const studentGrades = context.AppState.grades[s.id] || {};
      let applicableSubjects = [];
      let gpa = 0;

      if (mode === 'semester') {
        applicableSubjects = context.getSubjectsForClass(s.class, semNum);
        gpa = context.calculateSemesterGPA(s.id, semNum);
      } else if (mode === 'year') {
        const s1 = 2 * yearNum - 1;
        const s2 = 2 * yearNum;
        applicableSubjects = [
          ...context.getSubjectsForClass(s.class, s1),
          ...context.getSubjectsForClass(s.class, s2)
        ];
        gpa = context.calculateAcademicYearGPA(s.id, yearNum);
      } else {
        applicableSubjects = context.getSubjectsForClass(s.class);
        gpa = context.calculateYearGPA(s.id);
      }

      totalGpaSum += gpa;
      const rank = classify(gpa);
      const effectiveRank = rankCounts[rank] !== undefined ? rank : 'Trung bình';
      rankCounts[effectiveRank]++;

      if (effectiveRank === 'Xuất sắc' || effectiveRank === 'Giỏi') goodCount++;
      if (effectiveRank === 'Xuất sắc' || effectiveRank === 'Giỏi' || effectiveRank === 'Khá') khaGioiXsCount++;

      const studentDebts = [];
      let studentPassedCourses = 0;
      let studentFailedCourses = 0;

      applicableSubjects.forEach(sub => {
        const rawScore = studentGrades[sub.id];
        if (rawScore !== undefined && rawScore !== null && rawScore !== '' && !isNaN(rawScore)) {
          const numScore = Number(rawScore);
          totalGradedCourseInstances++;
          if (numScore < 4.0) {
            failedCourseInstances++;
            studentFailedCourses++;
            const fullCourseName = context.getFullSubjectName(sub);
            studentDebts.push({
              subject: { ...sub, name: fullCourseName, course_name: fullCourseName },
              score: numScore
            });
            failedCourseDetailsList.push({
              student: s,
              studentCode: s.code,
              studentName: s.name,
              studentRank: s.rank,
              studentClass: s.class,
              subject: sub,
              courseName: fullCourseName,
              semester: Number(sub.semester) || 1,
              academicYear: Math.ceil((Number(sub.semester) || 1) / 2),
              credits: Number(sub.credits) || 3,
              score: numScore,
              gpa,
              classification: effectiveRank
            });
          } else {
            passedCourseInstances++;
            studentPassedCourses++;
          }
        }
      });

      const hasDebt = studentDebts.length > 0;
      if (hasDebt) {
        debtStudentCount++;
        totalDebtFailsCount += studentDebts.length;
        rankDebtStudents[effectiveRank] = (rankDebtStudents[effectiveRank] || 0) + 1;
        rankFailInstances[effectiveRank] = (rankFailInstances[effectiveRank] || 0) + studentDebts.length;
        debtCadetsList.push({
          student: s,
          yearGpa: gpa,
          rank: effectiveRank,
          debts: studentDebts,
          failCount: studentDebts.length
        });
      }

      const cs = classStats[s.class];
      if (cs) {
        cs.count++;
        cs.totalGpa += gpa;
        cs.rankCounts[effectiveRank]++;
        if (effectiveRank === 'Xuất sắc') cs.xs++;
        else if (effectiveRank === 'Giỏi') cs.gioi++;
        else if (effectiveRank === 'Khá') cs.kha++;
        else if (effectiveRank === 'Trung bình khá') cs.tbk++;
        else if (effectiveRank === 'Trung bình') cs.tb++;
        else if (effectiveRank === 'Yếu') cs.yeu++;
        else cs.kem++;

        cs.passedCourses += studentPassedCourses;
        cs.failedCourses += studentFailedCourses;
        cs.totalGradedCourses += (studentPassedCourses + studentFailedCourses);

        if (hasDebt) {
          cs.debtStudents++;
          cs.totalFails += studentDebts.length;
        }
      }
    });

    const avgGpa = totalCadets > 0 ? (totalGpaSum / totalCadets).toFixed(2) : '0.00';
    const goodRate = totalCadets > 0 ? ((goodCount / totalCadets) * 100).toFixed(1) : '0.0';
    const khaGioiXsRate = totalCadets > 0 ? ((khaGioiXsCount / totalCadets) * 100).toFixed(1) : '0.0';
    const debtStudentRate = totalCadets > 0 ? ((debtStudentCount / totalCadets) * 100).toFixed(1) : '0.0';
    const passStudentCount = Math.max(0, totalCadets - debtStudentCount);
    const passStudentRate = totalCadets > 0 ? ((passStudentCount / totalCadets) * 100).toFixed(1) : '0.0';

    const coursePassRate = totalGradedCourseInstances > 0
      ? ((passedCourseInstances / totalGradedCourseInstances) * 100).toFixed(1)
      : (totalCadets > 0 ? '100.0' : '0.0');
    const courseFailRate = totalGradedCourseInstances > 0
      ? ((failedCourseInstances / totalGradedCourseInstances) * 100).toFixed(1)
      : '0.0';

    const rankRates = {};
    levels.forEach(r => {
      rankRates[r] = totalCadets > 0 ? (((rankCounts[r] || 0) / totalCadets) * 100).toFixed(1) : '0.0';
    });

    const label = mode === 'semester'
      ? `Theo Học kỳ ${semNum} (Năm thứ ${Math.ceil(semNum / 2)})`
      : mode === 'year'
        ? `Theo Năm học thứ ${yearNum} (HK${2 * yearNum - 1} & HK${2 * yearNum})`
        : 'Tích lũy từ đầu khóa đến nay (Toàn khóa)';

    return {
      mode,
      semester: semNum,
      year: yearNum,
      label,
      totalCadets,
      avgGpa,
      rankCounts,
      rankRates,
      rankDebtStudents,
      rankFailInstances,
      goodCount,
      goodRate,
      khaGioiXsCount,
      khaGioiXsRate,
      debtStudentCount,
      debtStudentRate,
      passStudentCount,
      passStudentRate,
      totalDebtFailsCount,
      passedCourseInstances,
      failedCourseInstances,
      totalGradedCourseInstances,
      coursePassRate,
      courseFailRate,
      classStats,
      debtCadetsList,
      failedCourseDetailsList
    };
  }

  /**
   * Xây dựng dữ liệu 5 Năm học cho Bảng 2:
   * Cấu trúc: Năm 1 (HK1, HK2, Cả năm, Số học viên rớt môn, Số lượt rớt) -> Năm 2 -> Năm 3 -> Năm 4 -> Năm 5
   */
  function buildAllYearsBreakdownStats(studentsList = [], policy = 'academic') {
    const yearsData = [];
    for (let y = 1; y <= 5; y++) {
      const sem1Num = 2 * y - 1;
      const sem2Num = 2 * y;
      const hk1Stats = computeTimeframeAcademicStats(studentsList, 'semester', sem1Num, y, policy);
      const hk2Stats = computeTimeframeAcademicStats(studentsList, 'semester', sem2Num, y, policy);
      const fullYearStats = computeTimeframeAcademicStats(studentsList, 'year', sem1Num, y, policy);
      yearsData.push({
        year: y,
        sem1Num,
        sem2Num,
        hk1: hk1Stats,
        hk2: hk2Stats,
        fullYear: fullYearStats
      });
    }
    return yearsData;
  }

  function computeReportAcademicStats(studentsList = [], mode = 'course', semester = 1, year = 1) {
    return computeTimeframeAcademicStats(studentsList, mode, semester, year, 'report');
  }
  function buildReportYearsBreakdownStats(studentsList = []) {
    return buildAllYearsBreakdownStats(studentsList, 'report');
  }


  return { RANK_META, REPORT_RANK_META, REPORT_RANK_LEVELS, getReportClassification, computeTimeframeAcademicStats, buildAllYearsBreakdownStats, computeReportAcademicStats, buildReportYearsBreakdownStats };
}
