// Dependencies are injected by grades.js; this module does not import the application shell.
export function createReportExports(context) {
  function exportReportExcel() {
    if (!['admin', 'company_officer'].includes(context.AppState.role) && !context.AppState.role?.startsWith('class_leader_')) {
      context.showToast('Tài khoản không có quyền xuất báo cáo giao ban.', 'error'); return;
    }
    const classScope = context.getCurrentUserClassScope();
    const selectedClass = classScope || (context.AppState.dashboardFilters?.class || 'all');

    let scopedStudents = context.getScopedStudents();
    if (selectedClass && selectedClass !== 'all') {
      scopedStudents = scopedStudents.filter(s => s.class === selectedClass);
    }

    const courseStats = context.computeReportAcademicStats(scopedStudents, 'course', 1, 1);
    const yearsBreakdown = context.buildReportYearsBreakdownStats(scopedStudents);

    // =========================================================================
    // SHEET 1: BÁO CÁO GIAO BAN TỔNG HỢP (ĐẦY ĐỦ 3 BẢNG: BẢNG 1, BẢNG 2, BẢNG 3)
    // =========================================================================
    const reportClasses = selectedClass === 'all' ? context.DEFAULT_CLASSES : [selectedClass];
    const rows1 = [
      ['HỌC VIỆN KỸ THUẬT QUÂN SỰ - TIỂU ĐOÀN 4 - ĐẠI ĐỘI 460'],
      ['BÁO CÁO GIAO BAN: TÌNH HÌNH HỌC TẬP, XẾP LOẠI HỌC LỰC & DANH SÁCH HỌC VIÊN RỚT MÔN'],
      [`Đơn vị: ${selectedClass === 'all' ? 'Toàn Đại đội 460 (5 Lớp)' : 'Lớp ' + selectedClass} • Ngày xuất báo cáo: ${new Date().toLocaleDateString('vi-VN')}`],
      [],
      ['BẢNG 1: TỶ LỆ TÍCH LŨY (TỪ ĐẦU KHÓA ĐẾN NAY)'],
      ['STT', 'Chỉ tiêu / Xếp loại học lực tích lũy', 'Tiêu chuẩn đánh giá (Hệ 10)', 'Số lượng', 'Tỷ lệ tích lũy (%)', ...reportClasses.map(className => `Lớp ${className}`), 'Ghi chú / Đánh giá chất lượng']
    ];

    context.REPORT_RANK_META.forEach((item, idx) => {
      rows1.push([
        idx + 1,
        `Xếp loại ${item.name}`,
        item.standard,
        `${courseStats.rankCounts[item.name] || 0} học viên`,
        `${courseStats.rankRates[item.name] || '0.0'}%`,
        ...reportClasses.map(className => courseStats.classStats[className]?.rankCounts[item.name] || 0),
        item.desc
      ]);
    });

    rows1.push(
      [
        'TỔNG',
        'Tổng hợp Tích lũy Toàn khóa',
        `ĐTB tích lũy: ${courseStats.avgGpa}`,
        `${courseStats.totalCadets} học viên`,
        '100.0%',
        `Đạt: ${courseStats.coursePassRate}% | Rớt: ${courseStats.courseFailRate}% | Số HV rớt môn: ${courseStats.debtStudentCount} | Số lượt rớt: ${courseStats.totalDebtFailsCount}`
      ]
    );

    rows1.push([]);
    rows1.push(['BẢNG 2: TỶ LỆ THEO TỪNG NĂM & TỪNG HỌC KỲ (NĂM 1 -> NĂM 2 -> NĂM 3 -> NĂM 4 -> NĂM 5)']);

    // Dòng tiêu đề cấp 1 của Bảng 2: Năm 1 (HK1, HK2, Cả năm, Số học viên rớt môn, Số lượt rớt) -> Năm 2...
    const matrixHeader1 = ['STT', 'Xếp loại Học lực / Chỉ tiêu', 'Tiêu chuẩn'];
    const matrixHeader2 = ['', '', ''];
    yearsBreakdown.forEach(yb => {
      matrixHeader1.push(
        `Năm ${yb.year} - HK1 (Kỳ ${yb.sem1Num})`,
        `Năm ${yb.year} - HK2 (Kỳ ${yb.sem2Num})`,
        `Năm ${yb.year} - Cả năm`,
        `Năm ${yb.year} - Số học viên rớt môn`,
        `Năm ${yb.year} - Số lượt rớt`
      );
      matrixHeader2.push('HK1 (SL / %)', 'HK2 (SL / %)', 'Cả năm (SL / %)', 'Số học viên rớt môn', 'Số lượt rớt');
    });
    rows1.push(matrixHeader1);
    rows1.push(matrixHeader2);

    context.REPORT_RANK_META.forEach((item, idx) => {
      const r = [idx + 1, item.name, item.standard];
      yearsBreakdown.forEach(yb => {
        const c1 = yb.hk1.rankCounts[item.name] || 0;
        const p1 = yb.hk1.rankRates[item.name] || '0.0';
        const c2 = yb.hk2.rankCounts[item.name] || 0;
        const p2 = yb.hk2.rankRates[item.name] || '0.0';
        const cy = yb.fullYear.rankCounts[item.name] || 0;
        const py = yb.fullYear.rankRates[item.name] || '0.0';
        const debtInRank = yb.fullYear.rankDebtStudents[item.name] || 0;
        const failsInRank = yb.fullYear.rankFailInstances[item.name] || 0;
        r.push(`${c1} (${p1}%)`, `${c2} (${p2}%)`, `${cy} (${py}%)`, `${debtInRank} học viên`, `${failsInRank} lượt`);
      });
      rows1.push(r);
    });

    const avgRow = ['TỔNG', 'Điểm trung bình (ĐTB) & Tổng số rớt theo Năm', 'Hệ 10'];

    yearsBreakdown.forEach(yb => {
      avgRow.push(
        `ĐTB HK1: ${yb.hk1.avgGpa}`,
        `ĐTB HK2: ${yb.hk2.avgGpa}`,
        `ĐTB Cả năm: ${yb.fullYear.avgGpa}`,
        `Tổng HV rớt: ${yb.fullYear.debtStudentCount} (${yb.fullYear.debtStudentRate}%)`,
        `Tổng lượt rớt: ${yb.fullYear.totalDebtFailsCount}`
      );
    });

    rows1.push(avgRow);

    rows1.push([]);
    rows1.push(['BẢNG 3: DANH SÁCH HỌC VIÊN RỚT MÔN (THI LẠI / NỢ HỌC PHẦN) CẦN BỒI DƯỠNG']);
    rows1.push([
      'STT',
      'Mã HV',
      'Họ và Tên',
      'Cấp bậc',
      'Lớp',
      'Các Học Phần Bị Rớt (< 4.0) — Tên môn học đầy đủ (Số TC • Học kỳ • Điểm số)',
      'Số Học Phần Rớt',
      'ĐTB Tích Lũy',
      'Xếp Loại Học Lực',
      'Biện Pháp Bồi Dưỡng / Kế Hoạch Khắc Phục'
    ]);

    if (courseStats.debtCadetsList.length === 0) {
      rows1.push(['-', '-', 'Không có học viên nào rớt môn trong phạm vi báo cáo này', '-', '-', '-', 0, '-', '-', '-']);
    } else {
      courseStats.debtCadetsList.forEach((item, idx) => {
        const s = item.student;
        const fullCoursesStr = item.debts
          .map(d => `${context.getFullSubjectName(d.subject)} (${d.subject.credits} TC - Học kỳ ${d.subject.semester} - Điểm: ${Number(d.score).toFixed(2)})`)
          .join('; ');
        rows1.push([
          idx + 1,
          s.code,
          s.name,
          s.rank,
          s.class,
          fullCoursesStr,
          item.failCount,
          item.yearGpa.toFixed(2),
          item.rank,
          `Phân công Cán sự lớp ${s.class} kèm cặp; duy trì tự học tối; đăng ký ôn và thi lại học phần.`
        ]);
      });
    }

    rows1.push([]);
    rows1.push(['PHỤ LỤC CHI TIẾT: DANH SÁCH CỤ THỂ TỪNG HỌC VIÊN BỊ RỚT MÔN NÀO (TÊN MÔN HỌC ĐẦY ĐỦ & ĐIỂM SỐ CỤ THỂ)']);
    rows1.push(['STT', 'Mã học viên', 'Họ và Tên học viên', 'Cấp bậc', 'Lớp', 'Tên môn học bị rớt (Tên đầy đủ)', 'Học kỳ', 'Năm học', 'Số tín chỉ', 'Điểm số cụ thể']);

    if (courseStats.failedCourseDetailsList.length === 0) {
      rows1.push(['-', '-', 'Không có lượt môn học nào bị rớt (< 4.0)', '-', '-', '-', '-', '-', '-', '-']);
    } else {
      courseStats.failedCourseDetailsList.forEach((d, idx) => {
        rows1.push([
          idx + 1,
          d.studentCode,
          d.studentName,
          d.studentRank,
          d.studentClass,
          context.getFullSubjectName(d.subject || d.courseName),
          `Học kỳ ${d.semester}`,
          `Năm thứ ${d.academicYear}`,
          d.credits,
          Number(d.score).toFixed(2)
        ]);
      });
    }

    // =========================================================================
    // SHEET 2: BẢNG 2 CHI TIẾT THEO TỪNG NĂM & TỪNG HỌC KỲ (NĂM 1 -> NĂM 5)
    // =========================================================================
    const rows2 = [
      ['HỌC VIỆN KỸ THUẬT QUÂN SỰ - TIỂU ĐOÀN 4 - ĐẠI ĐỘI 460'],
      ['BẢNG 2: THỐNG KÊ TỶ LỆ THEO TỪNG NĂM & TỪNG HỌC KỲ (NĂM 1 -> NĂM 5)'],
      ['Cấu trúc chuẩn: Năm 1 (HK1, HK2, Cả năm, Số học viên rớt môn, Số lượt rớt) -> Năm 2 -> Năm 3 -> Năm 4 -> Năm 5'],
      [],
      [
        'Năm học',
        'Mốc trong năm (HK1 / HK2 / Cả năm)',
        'Quân số',
        'Xuất sắc (SL / %)',
        'Giỏi (SL / %)',
        ...context.REPORT_RANK_LEVELS.slice(2).map(rank => `${rank} (SL / %)`),
        'Tỷ lệ Đạt học phần (%)',
        'Tỷ lệ Rớt học phần (%)',
        'Số học viên rớt môn',
        'Số lượt rớt',
        'ĐTB Chung'
      ]
    ];

    yearsBreakdown.forEach(yb => {
      const pushSubRow = (subTitle, st) => {
        rows2.push([
          `Năm ${yb.year}`,
          subTitle,
          st.totalCadets,
          ...context.REPORT_RANK_LEVELS.map(rank => `${st.rankCounts[rank]} (${st.rankRates[rank]}%)`),
          `${st.coursePassRate}%`,
          `${st.courseFailRate}%`,
          `${st.debtStudentCount} học viên (${st.debtStudentRate}%)`,
          `${st.totalDebtFailsCount} lượt`,
          st.avgGpa
        ]);
      };
      pushSubRow(`HK1 (Học kỳ ${yb.sem1Num})`, yb.hk1);
      pushSubRow(`HK2 (Học kỳ ${yb.sem2Num})`, yb.hk2);
      pushSubRow(`Cả năm Năm ${yb.year} (HK${yb.sem1Num} & HK${yb.sem2Num})`, yb.fullYear);
    });

    // =========================================================================
    // SHEET 3: DANH SÁCH HỌC VIÊN RỚT MÔN CẦN BỒI DƯỠNG & MÔN HỌC CỤ THỂ BỊ RỚT
    // =========================================================================
    let rows3 = [
      ['HỌC VIỆN KỸ THUẬT QUÂN SỰ - TIỂU ĐOÀN 4 - ĐẠI ĐỘI 460'],
      ['BẢNG 3: DANH SÁCH HỌC VIÊN RỚT MÔN (THI LẠI / NỢ HỌC PHẦN) CẦN BỒI DƯỠNG'],
      [`Tổng số học viên rớt môn: ${courseStats.debtStudentCount} đồng chí (${courseStats.debtStudentRate}%) • Tổng số lượt rớt: ${courseStats.totalDebtFailsCount} lượt`],
      [],
      [
        'STT',
        'Mã học viên',
        'Họ và Tên học viên',
        'Cấp bậc',
        'Lớp',
        'Tên môn học bị rớt (Tên đầy đủ, không viết tắt)',
        'Học kỳ',
        'Năm học',
        'Số tín chỉ',
        'Điểm số cụ thể',
        'ĐTB Tích lũy',
        'Xếp loại học lực',
        'Biện pháp bồi dưỡng / Kế hoạch khắc phục'
      ]
    ];

    courseStats.failedCourseDetailsList.forEach((d, idx) => {
      const fullCourseName = context.getFullSubjectName(d.subject || d.courseName);
      rows3.push([
        idx + 1,
        d.studentCode,
        d.studentName,
        d.studentRank,
        d.studentClass,
        fullCourseName,
        `Học kỳ ${d.semester}`,
        `Năm thứ ${d.academicYear}`,
        d.credits,
        Number(d.score).toFixed(2),
        Number(d.gpa).toFixed(2),
        d.classification,
        `Phân công Cán sự lớp ${d.studentClass} kèm cặp; ôn và thi lại môn ${fullCourseName}`
      ]);
    });

    const table3Start = rows1.findIndex(row => String(row[0] || '').startsWith('BẢNG 3:'));
    const appendixStart = rows1.findIndex(row => String(row[0] || '').startsWith('PHỤ LỤC CHI TIẾT:'));
    rows3 = [rows3[0], ...rows1.slice(table3Start, appendixStart), [], ...rows3.slice(1)];

    // Align summary descriptions with the added per-class columns in Table 1.
    const table2Start = rows1.findIndex(row => String(row[0] || '').startsWith('BẢNG 2:'));
    for (let i = 6 + context.REPORT_RANK_LEVELS.length; i < table2Start; i++) {
      if (rows1[i]?.length === 6) rows1[i].splice(5, 0, ...reportClasses.map(() => ''));
    }
    const ws1 = XLSX.utils.aoa_to_sheet(rows1);
    ws1['!cols'] = Array.from({ length: Math.max(...rows1.map(row => row.length)) }, (_, index) => ({ wch: index === 0 ? 8 : index === 1 ? 30 : 20 }));

    const ws2 = XLSX.utils.aoa_to_sheet(rows2);
    ws2['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 10 },
      ...context.REPORT_RANK_LEVELS.map(() => ({ wch: 20 })),
      { wch: 18 }, { wch: 18 }, { wch: 25 }, { wch: 16 }, { wch: 12 }];

    const ws3 = XLSX.utils.aoa_to_sheet(rows3);
    ws3['!cols'] = [
      { wch: 6 }, { wch: 16 }, { wch: 25 }, { wch: 14 }, { wch: 12 },
      { wch: 36 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 16 },
      { wch: 14 }, { wch: 16 }, { wch: 42 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws1, 'Bao_Cao_Giao_Ban_3_Bang');
    XLSX.utils.book_append_sheet(wb, ws2, 'Bang_2_Ty_Le_Nam_Hoc_Ky');
    XLSX.utils.book_append_sheet(wb, ws3, 'Bang_3_DS_HV_Rot_Mon');
    context.writeReportWorkbook(wb, `Bao_Cao_Tinh_Hinh_Hoc_Tap_${selectedClass === 'all' ? 'Dai_Doi_460' : selectedClass}.xlsx`);
  }


  function exportStudentPersonalExcel() {
    const student = context.getLoggedInStudent() || (context.AppState.role !== 'student' ? context.AppState.students.find(s => s.id === context.AppState.studentViewingId) || context.AppState.students[0] : null);
    if (!student) {
      context.showToast('Không tìm thấy thông tin học viên để xuất bảng điểm!', 'error');
      return;
    }

    const studentGrades = context.AppState.grades[student.id] || {};
    const rows = [
      ['HỌC VIỆN KỸ THUẬT QUÂN SỰ - TIỂU ĐOÀN 4 - ĐẠI ĐỘI 460'],
      ['BẢNG ĐIỂM VÀ THÔNG TIN CÁ NHÂN QUÂN NHÂN'],
      [],
      ['I. THÔNG TIN LÝ LỊCH CÁ NHÂN'],
      ['Họ và tên:', student.name, 'Mã học viên:', student.code],
      ['Cấp bậc:', student.rank, 'Lớp:', student.class],
      ['Chức vụ:', student.position || student.role || 'Học viên', 'Ngày sinh:', context.formatVN(student.dob)],
      ['Nhập ngũ:', student.enlistmentDate || '02/2022', 'Quê quán:', student.hometown || ''],
      ['Trình độ ngoại ngữ:', student.currentLangLevel || 'Chưa đạt'],
      ['Danh hiệu đạt được:', context.formatAchievementsText(student.achievements)],
      [],
      ['II. BẢNG ĐIỂM CHI TIẾT TỪ NĂM NHẤT ĐẾN NĂM NĂM (5 NĂM - 10 HỌC KỲ)']
    ];

    for (let y = 1; y <= 5; y++) {
      const sem1 = 2 * y - 1;
      const sem2 = 2 * y;
      const subs1 = context.getSubjectsForClass(student.class, sem1);
      const subs2 = context.getSubjectsForClass(student.class, sem2);
      const gpa1 = context.calculateSemesterGPA(student.id, sem1);
      const gpa2 = context.calculateSemesterGPA(student.id, sem2);
      const yearGpa = context.calculateAcademicYearGPA(student.id, y);
      const yearRank = context.getClassification(yearGpa);

      rows.push([]);
      rows.push([`NĂM HỌC THỨ ${y} (HỌC KỲ ${sem1} & HỌC KỲ ${sem2})`]);
      rows.push(['Hàng 1 - Học kỳ 1:', ...subs1.map(s => `${context.getFullSubjectName(s)} (${s.credits} TC): ${studentGrades[s.id] !== undefined ? studentGrades[s.id] : '-'}`), `ĐTB HK1: ${gpa1.toFixed(2)}`]);
      rows.push(['Hàng 2 - Học kỳ 2:', ...subs2.map(s => `${context.getFullSubjectName(s)} (${s.credits} TC): ${studentGrades[s.id] !== undefined ? studentGrades[s.id] : '-'}`), `ĐTB HK2: ${gpa2.toFixed(2)}`]);
      rows.push(['Hàng 3 - Tổng kết Năm học:', `Điểm trung bình Năm thứ ${y}: ${yearGpa.toFixed(2)}`, `Xếp loại Năm thứ ${y}: ${yearRank}`]);
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 24 }, { wch: 28 }, { wch: 28 }, { wch: 28 }, { wch: 28 }, { wch: 28 }, { wch: 22 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bang_Diem_Ca_Nhan');

    const year = Number(context.AppState.cumulativeSelectedYear) || 1;
    const cumulative = XLSX.utils.aoa_to_sheet([
      ['BẢNG ĐIỂM TÍCH LŨY CÁ NHÂN'], [`Năm học ${year} · Tích lũy toàn khóa`], [], [],
      ['STT','Mã HV','Họ và Tên','Cấp bậc','Lớp','Tín chỉ tích lũy','ĐTB Tích Lũy (Hệ 10)','Xếp loại (Hệ 10)','Điểm Hệ 4 (/4.0)','Trình độ ngoại ngữ hiện tại','Số học phần rớt (< 4.0)'],
      [1,student.code,student.name,student.rank,student.class,`${context.calculateCreditsPassed(student.id)} / ${context.getTotalCourseCredits(student.class)} TC`,context.calculateYearGPA(student.id).toFixed(2),context.getClassification(context.calculateYearGPA(student.id)),context.calculateCumulativeGPA4(student.id).toFixed(2),student.currentLangLevel || 'Chưa đạt',context.getDebtSubjects(student.id).length]
    ]);
    cumulative['!cols'] = Array.from({ length: 11 }, (_, i) => ({ wch: i === 2 ? 30 : 20 }));
    XLSX.utils.book_append_sheet(wb,cumulative,'Diem_Tich_Luy');

    // Định dạng tên file bắt buộc: Bảng điểm(thông tin cá nhân) - [Họ và tên học viên].xlsx
    const exactFilename = `Bảng điểm(thông tin cá nhân) - ${student.name}.xlsx`;
    context.writeReportWorkbook(wb, exactFilename);
  }

  function exportClassExcel() {
    if (context.AppState.role === 'student') {
      exportStudentPersonalExcel();
      return;
    }

    const cls = context.getCurrentUserClassScope() || context.AppState.currentSheetClass;
    if (!context.DEFAULT_CLASSES.includes(cls)) {
      context.showToast('Vui lòng chọn một lớp để tải bảng điểm.', 'error');
      return;
    }
    const students = context.getScopedStudents().filter(student => student.class === cls);
    if (!students.length) { context.showToast('Lớp chưa có học viên để xuất bảng điểm.', 'error'); return; }
    const semesters = Array.from({ length: 10 }, (_, index) => ({ semester: index + 1, subjects: context.getSubjectsForClass(cls, index + 1) }));
    const { headers, headerRows, merges, rows, completed } = context.buildClassTranscript(students, semesters, context.AppState.grades,
      context.calculateSemesterGPA, context.calculateAcademicYearGPA, context.getFullSubjectName, value => context.normalizeDateVN(value, ''));
    if (!completed.length) { context.showToast('Lớp chưa có kỳ nào đầy đủ điểm toàn bộ học viên.', 'error'); return; }
    const ws = XLSX.utils.aoa_to_sheet([...headerRows, ...rows]);
    ws['!reportHeaderRows'] = [1, 2, 3];
    ws['!merges'] = merges;
    ws['!rows'] = [{ hpt: 28 }, { hpt: 100 }, { hpt: 22 }];
    ws['!cols'] = headers.map((header, index) => ({ wch: header === 'GHI CHÚ' ? 30 : index === 0 ? 7 : index === 2 ? 28 : index < 5 ? 18 : header.startsWith('ĐIỂM TB') ? 16 : 12 }));
    for (let row = headerRows.length; row < rows.length + headerRows.length; row++) {
      for (let column = 5; column < headers.length - 1; column++) {
        const cell = ws[XLSX.utils.encode_cell({ r: row, c: column })];
        if (cell) cell.z = '0.00';
      }
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Bang_diem_${cls}`);
    context.writeReportWorkbook(wb, `Bảng điểm ${cls}.xlsx`);
  }

  function exportMasterExcel() {
    const year = Math.min(5, Math.max(1, Number(context.AppState.masterFilters.year) || 1));
    const sem1 = year * 2 - 1, sem2 = year * 2;
    const headers = [
      'STT', 'Mã HV', 'Họ và Tên', 'Cấp bậc', 'Lớp', 'Ngày sinh',
      'ĐTB HK1', 'ĐTB HK2', 'ĐTB Cả Năm',
      'Xếp loại Học lực', 'Học phần rớt (< 4.0)'
    ];

    const rows = [
      ['HỌC VIỆN KỸ THUẬT QUÂN SỰ - TIỂU ĐOÀN 4 - ĐẠI ĐỘI 460'],
      [`BẢNG TỔNG HỢP KẾT QUẢ HỌC TẬP TOÀN ĐẠI ĐỘI 460 - NĂM ${year}`],
      [],
      headers
    ];

    context.getScopedStudents().forEach((student, idx) => {
      const g1 = context.calculateSemesterGPA(student.id, sem1);
      const g2 = context.calculateSemesterGPA(student.id, sem2);
      const gy = context.calculateAcademicYearGPA(student.id, year);
      const debts = context.getDebtSubjects(student.id, null, year);

      rows.push([
        idx + 1,
        student.code,
        student.name,
        student.rank,
        student.class,
        context.formatVN(student.dob),
        g1.toFixed(2),
        g2.toFixed(2),
        gy.toFixed(2),
        context.getClassification(gy),
        debts.length > 0 ? debts.map(d => context.formatFailedSubjectItem(d.subject)).join('; ') : 'Đạt chuẩn'
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = headers.map(() => ({ wch: 16 }));
    ws['!cols'][2] = { wch: 24 };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tong_Hop_Dai_Doi');
    context.writeReportWorkbook(wb, `Tong_Hop_Diem_Dai_Doi_460_Nam_${year}.xlsx`);
  }

  function exportAcademicRanking() {
    if (!['admin', 'company_officer'].includes(context.AppState.role) && !context.AppState.role?.startsWith('class_leader_')) {
      context.showToast('Tài khoản không có quyền xuất xếp hạng điểm.', 'error'); return;
    }
    const year = Math.min(5, Math.max(1, Number(document.getElementById('rankingYearSelect')?.value) || 1));
    const scope = context.getCurrentUserClassScope();
    const students = context.getScopedStudents();
    if (!students.length) { context.showToast('Chưa có học viên để xếp hạng.', 'error'); return; }
    const standard = context.evaluateLangLevelStatus('Chưa đạt', context.AppState.requiredLangStandard).requiredStandard;
    const { roster } = context.collectLanguageStatistics(students, context.AppState.languages || {}, standard, context.evaluateLangLevelStatus, scope ? [scope] : context.DEFAULT_CLASSES);
    const round = value => Number(Number(value).toFixed(2));
    const records = roster.map(({ student, passed }) => {
      const hasScore = semester => context.getSubjectsForClass(student.class, semester).some(subject => {
        const score = context.AppState.grades[student.id]?.[subject.id];
        return score !== '' && score !== undefined && score !== null && Number.isFinite(Number(score));
      });
      const first = year * 2 - 1, second = year * 2;
      const hasFirst = hasScore(first), hasSecond = hasScore(second);
      return { student, languagePassed: passed,
        hk1: hasFirst ? round(context.calculateSemesterGPA(student.id, first)) : null,
        hk2: hasSecond ? round(context.calculateSemesterGPA(student.id, second)) : null,
        total: hasFirst || hasSecond ? context.calculateAcademicYearGPA(student.id, year) : null };
    });
    const makeSheet = blocks => {
      const sheet = XLSX.utils.aoa_to_sheet([]);
      sheet['!cols'] = []; sheet['!merges'] = []; sheet['!reportCellFills'] = {}; sheet['!reportBlankColumns'] = [];
      sheet['!reportHeaderRows'] = [1, 2, 3]; sheet['!reportRepeatRows'] = 3;
      blocks.forEach(({ label, members }, index) => {
        const start = index * 12;
        const table = context.rankingTableRows(members, value => context.normalizeDateVN(value, ''));
        XLSX.utils.sheet_add_aoa(sheet, [[`XẾP HẠNG ĐIỂM - ${label}`], [`Năm ${year} • Yêu cầu Tiếng Nga: ${standard} • Xanh: tối đa 10% • Vàng: tiếp theo tối đa 25%`], context.RANKING_HEADERS, ...table.rows], { origin: { r: 0, c: start } });
        for (const row of [0,1]) sheet['!merges'].push({ s: { r: row, c: start }, e: { r: row, c: start + 9 } });
        [7,20,28,24,12,16,16,20,16,24].forEach((wch,column) => { sheet['!cols'][start + column] = { wch }; });
        table.ranked.forEach((record, row) => {
          for (let column = 0; column < 10; column++) {
            const address = XLSX.utils.encode_cell({ r: row + 3, c: start + column });
            if (record.award) sheet['!reportCellFills'][address] = record.award;
            if (column >= 5 && column <= 7 && sheet[address]?.t === 'n') sheet[address].z = '0.00';
          }
        });
        if (index < blocks.length - 1) for (const offset of [10,11]) {
          sheet['!cols'][start + offset] = { wch: 4 };
          sheet['!reportBlankColumns'].push(XLSX.utils.encode_col(start + offset));
        }
      });
      return sheet;
    };
    const wb = XLSX.utils.book_new();
    if (scope) {
      XLSX.utils.book_append_sheet(wb, makeSheet([{ label: `LỚP ${scope}`, members: records }]), 'Xep_hang_lop');
    } else {
      XLSX.utils.book_append_sheet(wb, makeSheet([{ label: 'TOÀN ĐẠI ĐỘI', members: records }]), 'Toan_dai_doi');
      XLSX.utils.book_append_sheet(wb, makeSheet(context.DEFAULT_CLASSES.map(className => ({ label: `LỚP ${className}`, members: records.filter(item => item.student.class === className) }))), 'Tung_lop');
    }
    context.writeReportWorkbook(wb, 'Xếp hạng điểm.xlsx');
  }

  function exportLanguageExcel() {
    if (!['admin', 'company_officer'].includes(context.AppState.role) && !context.AppState.role?.startsWith('class_leader_')) {
      context.showToast('Tài khoản không có quyền tải danh sách Tiếng Nga.', 'error'); return;
    }
    const students = context.getScopedStudents();
    if (!students.length) { context.showToast('Chưa có học viên để xuất danh sách.', 'error'); return; }
    const scope = context.getCurrentUserClassScope();
    const standard = context.evaluateLangLevelStatus('Chưa đạt', context.AppState.requiredLangStandard).requiredStandard;
    const { roster } = context.collectLanguageStatistics(students, context.AppState.languages || {}, standard, context.evaluateLangLevelStatus, scope ? [scope] : context.DEFAULT_CLASSES);
    const headers = ['STT', 'MÃ HỌC VIÊN', 'HỌ VÀ TÊN', 'NGÀY THÁNG NĂM SINH', 'TRÌNH ĐỘ THỰC TẾ', 'GHI CHÚ'];
    const rows = roster.map(({ student, level }, index) => [index + 1, String(student.code || ''), student.name, context.normalizeDateVN(student.dob, ''), level, '']);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const passed = roster.filter(item => item.passed).length;
    const total = roster.length;
    XLSX.utils.sheet_add_aoa(ws, [
      [`Yêu cầu: (${standard})`, 'SỐ LƯỢNG', 'TỶ LỆ'],
      ['ĐẠT', passed, total ? passed / total : 0],
      ['CHƯA ĐẠT', total - passed, total ? (total - passed) / total : 0]
    ], { origin: 'H4' });
    ws.J5.z = '0.0%'; ws.J6.z = '0.0%';
    ws['!reportHeaderRows'] = [1];
    ws['!cols'] = [{ wch: 7 }, { wch: 20 }, { wch: 30 }, { wch: 24 }, { wch: 22 }, { wch: 30 }, { wch: 4 }, { wch: 24 }, { wch: 14 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Danh_sach_tieng_Nga');
    context.writeReportWorkbook(wb, 'Danh sách tiếng Nga.xlsx');
  }

  function getDashboardLanguageData() {
    const scope = context.getCurrentUserClassScope();
    let classes = scope ? [scope] : context.DEFAULT_CLASSES;
    const standard = context.evaluateLangLevelStatus('Chưa đạt', context.AppState.requiredLangStandard).requiredStandard;
    const selected = context.AppState.activeTab === 'tab-reports' ? document.getElementById('reportsClassSelect')?.value || 'all' : 'all';
    if (!scope && selected !== 'all') classes = [selected];
    const students = context.getScopedStudents().filter(student => scope || selected === 'all' || student.class === selected);
    return { standard, scope: scope || (selected !== 'all' ? selected : null), ...context.collectLanguageStatistics(students, context.AppState.languages || {}, standard, context.evaluateLangLevelStatus, classes) };
  }

  function renderDashboardLanguageSummary() {
    const tbody = document.getElementById('dashboardLanguageSummaryBody');
    if (!tbody) return;
    if (!['admin', 'company_officer'].includes(context.AppState.role) && !context.AppState.role?.startsWith('class_leader_')) { tbody.replaceChildren(); return; }
    const { rows, standard, scope } = getDashboardLanguageData();
    const select = document.getElementById('dashboardLanguageStandard');
    if (select) {
      const options = context.LANGUAGE_LEVEL_OPTIONS.filter(level => level !== 'Chưa đạt');
      if (!select.options.length) options.forEach(level => select.append(new Option(level, level)));
      select.value = standard;
      select.disabled = context.AppState.role !== 'admin';
    }
    const caption = document.getElementById('dashboardOverviewScope');
    if (caption) caption.textContent = `${scope ? 'Lớp ' + scope : 'Toàn Đại đội 460 · 5 lớp'} · Chuẩn hiện tại: ${standard} · Tỷ lệ tính trên quân số từng lớp.`;
    const percent = value => `${value.toLocaleString('vi-VN', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`;
    tbody.replaceChildren(...rows.map(item => {
      const row = document.createElement('tr');
      [item.className, item.total, item.passed, percent(item.passedRate), item.notPassed, percent(item.notPassedRate)].forEach((value, index) => {
        const cell = document.createElement(index === 0 ? 'th' : 'td');
        if (index === 0) cell.scope = 'row';
        if (index === 2 || index === 3) cell.className = 'language-summary-pass';
        if (index === 4 || index === 5) cell.className = 'language-summary-fail';
        cell.textContent = value; row.append(cell);
      });
      return row;
    }));
  }

  function exportDashboardLanguageExcel() {
    if (!['admin', 'company_officer'].includes(context.AppState.role) && !context.AppState.role?.startsWith('class_leader_')) { context.showToast('Tài khoản không có quyền xuất thống kê đơn vị.', 'error'); return; }
    const { rows, roster, standard, scope } = getDashboardLanguageData();
    const preamble = [['ĐẠI ĐỘI 460'], ['THỐNG KÊ ĐẠT CHUẨN NGOẠI NGỮ'], [`Chuẩn ngoại ngữ hiện tại: ${standard}`], [`Phạm vi: ${scope || 'Toàn Đại đội 460'}`]];
    const summary = XLSX.utils.aoa_to_sheet([...preamble,
      ['Lớp', 'Quân số', 'Số lượng đạt', 'Tỷ lệ đạt (%)', 'Số lượng chưa đạt', 'Tỷ lệ chưa đạt (%)'],
      ...rows.map(item => [item.className, item.total, item.passed, Number(item.passedRate.toFixed(1)), item.notPassed, Number(item.notPassedRate.toFixed(1))])
    ]);
    const list = XLSX.utils.aoa_to_sheet([...preamble,
      ['Mã học viên', 'Họ và tên', 'Ngày sinh', 'Lớp', 'Trình độ hiện tại', 'Trạng thái'],
      ...roster.map(({ student, level, passed }) => [student.code, student.name, context.normalizeDateVN(student.dob, ''), student.class, level.replaceAll('.', ''), passed ? 'Đạt' : 'Chưa đạt'])
    ]);
    summary['!cols'] = [{ wch: 16 }, { wch: 12 }, { wch: 18 }, { wch: 20 }, { wch: 20 }, { wch: 22 }];
    list['!cols'] = [{ wch: 18 }, { wch: 30 }, { wch: 12 }, { wch: 14 }, { wch: 22 }, { wch: 18 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, summary, 'Thong_Ke_Theo_Lop');
    XLSX.utils.book_append_sheet(workbook, list, 'Danh_Sach_Hoc_Vien');
    context.writeReportWorkbook(workbook, `Thong_Ke_Ngoai_Ngu_${scope || 'Dai_Doi_460'}_${standard}.xlsx`);
  }

  function exportFailedStudentsExcel() {
    if (!['admin', 'company_officer'].includes(context.AppState.role) && !context.AppState.role?.startsWith('class_leader_')) { context.showToast('Tài khoản không có quyền xuất thống kê đơn vị.', 'error'); return; }
    const scope = context.getCurrentUserClassScope();
    const selected = scope || (context.AppState.activeTab === 'tab-reports' ? document.getElementById('reportsClassSelect')?.value : 'all') || 'all';
    const exportScope = scope || (selected !== 'all' ? selected : null);
    const stats = context.computeReportAcademicStats(context.getScopedStudents().filter(student => selected === 'all' || student.class === selected));
    const records = context.failedStudentExportRows(stats.debtCadetsList, context.getFullSubjectName);
    const sheet = XLSX.utils.aoa_to_sheet([
      ['ĐẠI ĐỘI 460'], ['DANH SÁCH HỌC VIÊN RỚT MÔN'], [`Phạm vi: ${exportScope || 'Toàn Đại đội 460'}`], ['Chỉ học phần dưới 4,00; tổng tín chỉ là tổng tín chỉ các học phần rớt.'],
      ['Mã học viên', 'Họ và tên', 'Năm sinh', 'Lớp', 'Môn học rớt (tín chỉ)', 'Tổng số tín chỉ rớt'], ...records
    ]);
    sheet['!cols'] = [{ wch: 18 }, { wch: 30 }, { wch: 12 }, { wch: 14 }, { wch: 65 }, { wch: 22 }];
    sheet['!rows'] = Array.from({ length: records.length + 5 }, (_, index) => ({ hpt: index < 5 ? 20 : Math.max(24, String(records[index - 5][4]).split('\n').length * 18) }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Hoc_Vien_Rot_Mon');
    context.writeReportWorkbook(workbook, `Hoc_Vien_Rot_Mon_${exportScope || 'Dai_Doi_460'}.xlsx`);
  }

  function exportAcademicAchievementsExcel() {
    if (!['admin','company_officer'].includes(context.AppState.role) && !context.AppState.role?.startsWith('class_leader_')) return;
    const selected = context.getCurrentUserClassScope() || document.getElementById('reportsClassSelect')?.value || 'all';
    const students = context.getScopedStudents().filter(student => selected === 'all' || student.class === selected);
    const sheet = XLSX.utils.aoa_to_sheet([
      ['ĐẠI ĐỘI 460'],['BÁO CÁO THÀNH TÍCH HỌC TẬP'],[`Phạm vi: ${selected}`],[],
      ['Mã học viên','Họ và tên','Ngày sinh','Lớp','Điểm tích lũy hệ 10','Điểm tích lũy hệ 4','Xếp loại','Danh hiệu / Thành tích'],
      ...students.map(student => [student.code,student.name,context.normalizeDateVN(student.dob,''),student.class,Number(context.calculateYearGPA(student.id).toFixed(2)),Number(context.calculateCumulativeGPA4(student.id).toFixed(2)),context.getClassification(context.calculateYearGPA(student.id)),context.formatAchievementsText(student.achievements)])
    ]);
    sheet['!cols'] = [18,30,16,14,22,22,20,60].map(wch=>({wch}));
    const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book,sheet,'Thanh_Tich_Hoc_Tap');
    context.writeReportWorkbook(book,`Thanh_Tich_Hoc_Tap_${selected}.xlsx`);
  }


  function exportCumulativeExcel() {
    if (context.AppState.role === 'student') return exportStudentPersonalExcel();
    const classScope = context.getCurrentUserClassScope();
    const targetClass = classScope || document.getElementById('cumulFilterClass')?.value || 'all';
    const targetRank = document.getElementById('cumulFilterRank')?.value || 'all';
    const filterYear = parseInt(document.getElementById('cumulFilterYear')?.value || context.AppState.cumulativeSelectedYear || '1', 10) || 1;
    const sem1 = 2 * filterYear - 1;
    const sem2 = 2 * filterYear;

    let studentsToExport = context.getScopedStudents();
    if (targetClass !== 'all') {
      studentsToExport = studentsToExport.filter(s => s.class === targetClass);
    }
    if (targetRank !== 'all') {
      studentsToExport = studentsToExport.filter(s => context.getClassification(context.calculateYearGPA(s.id)) === targetRank);
    }

    studentsToExport.sort((a, b) => context.calculateYearGPA(b.id) - context.calculateYearGPA(a.id));

    const headers = [
      'STT', 'Mã HV', 'Họ và Tên', 'Cấp bậc', 'Lớp',
      'Tín chỉ tích lũy',
      'ĐTB Tích Lũy (Hệ 10)', 'Xếp loại (Hệ 10)', 'Điểm Hệ 4 (/4.0)',
      'Trình độ ngoại ngữ hiện tại', 'Số học phần rớt (< 4.0)'
    ];

    const rows = [
      ['BỘ QUỐC PHÒNG - HỌC VIỆN KỸ THUẬT QUÂN SỰ'],
      ['TIỂU ĐOÀN 4 - ĐẠI ĐỘI 460'],
      [targetClass !== 'all' ? `BẢNG ĐIỂM TÍCH LŨY - LỚP ${targetClass}` : 'BẢNG ĐIỂM TÍCH LŨY TOÀN ĐẠI ĐỘI 460'],
      [],
      headers
    ];

    studentsToExport.forEach((s, idx) => {
      const gpa10 = context.calculateYearGPA(s.id);
      const gpa4 = context.calculateCumulativeGPA4(s.id);
      const passedTC = context.calculateCreditsPassed(s.id);
      const totalTC = context.getTotalCourseCredits(s.class);
      const debts = context.getDebtSubjects(s.id);

      rows.push([
        idx + 1,
        s.code,
        s.name,
        s.rank,
        s.class,
        `${passedTC} / ${totalTC} TC`,
        gpa10.toFixed(2),
        context.getClassification(gpa10),
        gpa4.toFixed(2),
        s.currentLangLevel || 'Chưa đạt',
        debts.length
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = headers.map(() => ({ wch: 16 }));
    ws['!cols'][2] = { wch: 24 };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Diem_Tich_Luy');
    context.writeReportWorkbook(wb, `Bang_Diem_Tich_Luy_${targetClass !== 'all' ? targetClass : 'Dai_Doi_460'}.xlsx`);
  }


  return { exportReportExcel, exportStudentPersonalExcel, exportClassExcel, exportMasterExcel, exportAcademicRanking, exportLanguageExcel, getDashboardLanguageData, renderDashboardLanguageSummary, exportDashboardLanguageExcel, exportFailedStudentsExcel, exportAcademicAchievementsExcel, exportCumulativeExcel };
}
