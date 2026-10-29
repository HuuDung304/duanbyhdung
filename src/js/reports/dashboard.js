// Dependencies are injected by grades.js; this module does not import the application shell.
export function createDashboardReports(context) {
  function renderDashboard() {
    const elTotal = document.getElementById('statTotalCadets');
    if (!document.getElementById('tab-dashboard')) return;

    if (!context.AppState.dashboardFilters) {
      context.AppState.dashboardFilters = { mode: 'course', semester: 1, year: 1, class: 'all' };
    }

    const classScope = context.getCurrentUserClassScope();
    const dashClassSelect = document.getElementById('dashboardClassFilter');
    if (dashClassSelect) {
      if (classScope) {
        dashClassSelect.innerHTML = context.sanitizeHTML(`<option value="${classScope}">Lớp ${classScope}</option>`);
        dashClassSelect.value = classScope;
        dashClassSelect.disabled = true;
        context.AppState.dashboardFilters.class = classScope;
      } else {
        dashClassSelect.disabled = false;
        if (dashClassSelect.value !== context.AppState.dashboardFilters.class) {
          dashClassSelect.value = context.AppState.dashboardFilters.class || 'all';
        }
      }
    }

    const selectedClass = classScope || (dashClassSelect ? dashClassSelect.value : (context.AppState.dashboardFilters.class || 'all'));
    context.AppState.dashboardFilters.class = selectedClass;
    if (typeof context.ExternalHooks.renderBentoDashboard === 'function') context.ExternalHooks.renderBentoDashboard();

    // 1. Tính toán Tỷ lệ Tích lũy từ đầu khóa đến nay (Bảng 1)
    const tableStudents = id => {
      const select = document.getElementById(id);
      const scope = classScope || select?.value || selectedClass || 'all';
      if (select) { select.value = scope; select.disabled = Boolean(classScope); }
      return context.getScopedStudents().filter(student => scope === 'all' || student.class === scope);
    };
    const courseStats = context.computeReportAcademicStats(tableStudents('reportCourseFilterClass'), 'course', 1, 1);

    // 2. Tính toán Tỷ lệ theo Từng Năm & Từng Học kỳ: Năm 1 -> Năm 5 (Bảng 2)
    const yearsBreakdown = context.buildReportYearsBreakdownStats(tableStudents('reportYearsFilterClass'));

    const overviewStudents = context.getScopedStudents();
    const overviewStats = context.computeReportAcademicStats(overviewStudents);
    const overviewYears = context.buildReportYearsBreakdownStats(overviewStudents);
    context.renderDashboardLanguageSummary();

    // Cập nhật 4 thẻ KPI tổng quan trên đầu Báo cáo giao ban
    if (elTotal) elTotal.textContent = overviewStats.totalCadets;
    const elScopeSub = document.getElementById('statScopeSubtitle');
    if (elScopeSub) {
      elScopeSub.textContent = `${classScope ? 'Lớp ' + classScope : 'Toàn Đại đội 460 (5 lớp)'} • Tích lũy từ đầu khóa đến nay`;
    }

    const elAvg = document.getElementById('statAvgGPA');
    if (elAvg) elAvg.textContent = overviewStats.totalGradedCourseInstances ? overviewStats.avgGpa : '—';
    const elAvgSub = document.getElementById('statAvgGPASub');
    if (elAvgSub) {
      const yGpas = overviewYears.map(yb => `N${yb.year}: ${yb.fullYear.totalGradedCourseInstances ? yb.fullYear.avgGpa : '—'}`).join(' • ');
      elAvgSub.textContent = yGpas;
    }

    const elGoodRate = document.getElementById('statGoodRate');
    if (elGoodRate) elGoodRate.textContent = `${overviewStats.goodRate}%`;
    const elGoodCount = document.getElementById('statGoodCount');
    if (elGoodCount) {
      elGoodCount.textContent = `XS & Giỏi: ${overviewStats.goodCount}/${overviewStats.totalCadets} đ/c • Khá trở lên: ${overviewStats.khaGioiXsCount} đ/c (${overviewStats.khaGioiXsRate}%)`;
    }

    const standard = context.evaluateLangLevelStatus('Chưa đạt', context.AppState.requiredLangStandard).requiredStandard;
    const { roster } = context.collectLanguageStatistics(overviewStudents, context.AppState.languages || {}, standard, context.evaluateLangLevelStatus, classScope ? [classScope] : context.DEFAULT_CLASSES);
    const total = roster.length, passed = roster.filter(item => item.passed).length;
    const notPassed = total - passed;
    const languagePassRate = total ? (passed * 100 / total).toFixed(1) : '0.0';
    const languageNotPassedRate = total ? (notPassed * 100 / total).toFixed(1) : '0.0';
    const elPassRate = document.getElementById('statLanguagePassRate');
    if (elPassRate) elPassRate.textContent = `${languagePassRate}%`;
    const elFailRate = document.getElementById('statLanguageNotPassedRate');
    if (elFailRate) elFailRate.textContent = `${languageNotPassedRate}%`;
    const elPassFailDetail = document.getElementById('statLanguageDetail');
    if (elPassFailDetail) {
      elPassFailDetail.textContent = `Chuẩn ${standard} • ${classScope ? 'Lớp ' + classScope : 'Toàn đơn vị'}: ${passed}/${total} học viên đạt • ${notPassed}/${total} chưa đạt`;
    }

    const elDebtCount = document.getElementById('statDebtCount');
    if (elDebtCount) elDebtCount.textContent = overviewStats.debtStudentCount;
    const debtRate = document.getElementById('statDebtRate');
    if (debtRate) debtRate.textContent = `${overviewStats.debtStudentRate}% quân số`;
    const elDebtFails = document.getElementById('statDebtTotalFails');
    if (elDebtFails) elDebtFails.textContent = overviewStats.totalDebtFailsCount;

    const elActiveModeBadge = document.getElementById('reportActiveModeBadge');
    if (elActiveModeBadge) {
      elActiveModeBadge.textContent = `Phạm vi: ${selectedClass === 'all' ? 'Toàn Đại đội 460 (5 Lớp)' : 'Lớp ' + selectedClass}`;
    }

    const courseScope = classScope || document.getElementById('reportCourseFilterClass')?.value || selectedClass;
    const visibleClasses = courseScope && courseScope !== 'all' ? [courseScope] : context.DEFAULT_CLASSES;

    // =========================================================================
    // BẢNG 1: TỶ LỆ TÍCH LŨY (XẾP LOẠI HỌC LỰC 7 MỨC & TỶ LỆ ĐẠT/RỚT TỪ ĐẦU KHÓA ĐẾN NAY)
    // =========================================================================
    const companyTbody = document.getElementById('reportCompanyTableBody');
    const companyTfoot = document.getElementById('reportCompanyTableFooter');
    if (companyTbody) {
      const rankRowsHtml = context.REPORT_RANK_META.map((item, idx) => {
        const cCourse = courseStats.rankCounts[item.name] || 0;
        const rCourse = courseStats.rankRates[item.name] || '0.0';

        const classBreakdownStr = visibleClasses.map(clsName => {
          const cs = courseStats.classStats[clsName];
          if (!cs) return `${clsName}: 0`;
          const val = cs.rankCounts[item.name] || 0;
          return `<span class="inline-block px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-[10px] mr-1">${clsName}: <strong>${val}</strong></span>`;
        }).join('');

        return `
          <tr class="hover:bg-slate-50 transition">
            <td class="py-2.5 px-3 text-center text-slate-500 font-medium">${idx + 1}</td>
            <td class="py-2.5 px-4 font-bold text-slate-900">
              <span class="inline-block px-2.5 py-0.5 rounded text-[11px] font-bold border ${item.badge}">${context.escapeHTML(item.name)}</span>
            </td>
            <td class="py-2.5 px-3 text-center font-mono font-semibold text-slate-700 bg-slate-50/60">${item.standard}</td>
            <td class="py-2.5 px-3 text-center font-extrabold text-slate-900 bg-amber-50/40">${cCourse} đồng chí</td>
            <td class="py-2.5 px-3 text-center bg-amber-50/60">
              <span class="px-2.5 py-0.5 rounded bg-army-800 text-gold-300 font-black text-xs">${rCourse}%</span>
            </td>
            <td class="py-2.5 px-3 text-left">${classBreakdownStr}</td>
            <td class="py-2.5 px-4 text-slate-600">${item.desc}</td>
          </tr>
        `;
      }).join('');

      // Hai hàng sau các mức xếp loại trong Bảng 1: Tỷ lệ Đạt / Rớt tích lũy từ đầu khóa đến nay
      companyTbody.innerHTML = context.sanitizeHTML(rankRowsHtml);

      if (companyTfoot) {
        companyTfoot.innerHTML = context.sanitizeHTML(`
          <tr class="bg-slate-100 border-t-2 border-slate-300 text-slate-900">
            <td colspan="3" class="py-3 px-4 uppercase text-army-900 font-black">TỔNG HỢP TÍCH LŨY TOÀN KHÓA (TỪ ĐẦU KHÓA ĐẾN NAY):</td>
            <td class="py-3 px-3 text-center font-black text-army-900 text-xs">${courseStats.totalCadets} đồng chí (100%)</td>
            <td class="py-3 px-3 text-center font-black text-army-900 text-xs">ĐTB Tích lũy: <span class="text-sm text-army-800">${courseStats.avgGpa}</span></td>
            <td colspan="2" class="py-3 px-4 text-slate-800">
              <div class="flex flex-wrap items-center gap-2 text-xs">
                <span>Tỷ lệ Đạt/Rớt: <strong class="text-emerald-700">${courseStats.coursePassRate}% Đạt</strong> / <strong class="text-rose-700">${courseStats.courseFailRate}% Rớt</strong></span>
                <span class="text-slate-300">|</span>
                <span class="text-rose-700">Tổng số HV rớt môn: <strong class="font-black text-rose-800">${courseStats.debtStudentCount} đ/c (${courseStats.debtStudentRate}%)</strong></span>
                <span class="text-slate-300">|</span>
                <span class="text-rose-700">Tổng số lượt rớt: <strong class="font-black text-rose-800">${courseStats.totalDebtFailsCount} lượt</strong></span>
              </div>
            </td>
          </tr>
        `);
      }
    }

    // =========================================================================
    // BẢNG 2: TỶ LỆ THEO TỪNG NĂM & TỪNG HỌC KỲ
    // Cấu trúc tuần tự: Năm 1 (HK1, HK2, Cả năm, Số học viên rớt môn, Số lượt rớt) -> Năm 2 -> Năm 3 -> Năm 4 -> Năm 5
    // =========================================================================
    const matrixThead = document.getElementById('reportYearSemesterMatrixThead');
    const matrixTbody = document.getElementById('reportYearSemesterMatrixBody');
    const matrixTfoot = document.getElementById('reportYearSemesterMatrixFooter');

    if (matrixThead && matrixTbody) {
      const yearColors = [
        { headerBg: 'bg-army-900 text-gold-300', subBg: 'bg-army-800 text-white' },
        { headerBg: 'bg-slate-900 text-emerald-300', subBg: 'bg-slate-800 text-white' },
        { headerBg: 'bg-army-900 text-amber-300', subBg: 'bg-army-800 text-white' },
        { headerBg: 'bg-slate-900 text-cyan-300', subBg: 'bg-slate-800 text-white' },
        { headerBg: 'bg-army-950 text-gold-400', subBg: 'bg-army-900 text-white' }
      ];

      const topYearHeaders = yearsBreakdown.map((yb, idx) => {
        const colStyle = yearColors[idx] || yearColors[0];
        return `
          <th colspan="5" class="py-2.5 px-3 text-center font-black uppercase border-b border-slate-600 ${colStyle.headerBg}">
            NĂM ${yb.year} (HK1, HK2, Cả năm, Số học viên rớt môn, Số lượt rớt)
            <div class="text-[10px] font-normal text-slate-200 mt-0.5">Học kỳ ${yb.sem1Num} &amp; Học kỳ ${yb.sem2Num}</div>
          </th>
        `;
      }).join('');

      const subYearHeaders = yearsBreakdown.map((yb, idx) => {
        const colStyle = yearColors[idx] || yearColors[0];
        return `
          <th class="py-2 px-2.5 text-center min-w-[95px] ${colStyle.subBg}">HK1<br><span class="text-[9px] font-normal text-slate-300">(Kỳ ${yb.sem1Num}: SL / %)</span></th>
          <th class="py-2 px-2.5 text-center min-w-[95px] ${colStyle.subBg}">HK2<br><span class="text-[9px] font-normal text-slate-300">(Kỳ ${yb.sem2Num}: SL / %)</span></th>
          <th class="py-2 px-2.5 text-center min-w-[100px] bg-amber-900/90 text-gold-200 font-bold">Cả năm<br><span class="text-[9px] font-normal text-amber-100">(Năm ${yb.year}: SL / %)</span></th>
          <th class="py-2 px-2.5 text-center min-w-[115px] bg-rose-900 text-white font-bold">Số học viên rớt môn<br><span class="text-[9px] font-normal text-rose-200">(Năm ${yb.year})</span></th>
          <th class="py-2 px-2.5 text-center min-w-[95px] bg-rose-950 text-gold-300 font-black">Số lượt rớt<br><span class="text-[9px] font-normal text-rose-200">(Năm ${yb.year})</span></th>
        `;
      }).join('');

      matrixThead.innerHTML = context.sanitizeHTML(`
        <tr class="divide-x divide-slate-600 bg-army-950 text-white text-xs">
          <th rowspan="2" class="py-2.5 px-2 text-center w-10 sticky left-0 z-20 bg-army-950">STT</th>
          <th rowspan="2" class="py-2.5 px-3 min-w-[155px] sticky left-10 z-20 bg-army-950">Xếp Loại Học Lực / Chỉ Tiêu</th>
          <th rowspan="2" class="py-2.5 px-2 text-center min-w-[115px]">Tiêu Chuẩn</th>
          ${topYearHeaders}
        </tr>
        <tr class="divide-x divide-slate-600 text-[11px]">
          ${subYearHeaders}
        </tr>
      `);

      // 7 hàng xếp loại học lực
      const rankMatrixRows = context.REPORT_RANK_META.map((item, rIdx) => {
        const yearCells = yearsBreakdown.map(yb => {
          const c1 = yb.hk1.rankCounts[item.name] || 0;
          const r1 = yb.hk1.rankRates[item.name] || '0.0';
          const c2 = yb.hk2.rankCounts[item.name] || 0;
          const r2 = yb.hk2.rankRates[item.name] || '0.0';
          const cy = yb.fullYear.rankCounts[item.name] || 0;
          const ry = yb.fullYear.rankRates[item.name] || '0.0';
          const debtInRank = yb.fullYear.rankDebtStudents[item.name] || 0;
          const failsInRank = yb.fullYear.rankFailInstances[item.name] || 0;

          return `
            <td class="py-2 px-2 text-center border-l border-slate-200">
              <span class="font-bold text-slate-900">${c1}</span>
              <span class="text-[10px] text-slate-500">(${r1}%)</span>
            </td>
            <td class="py-2 px-2 text-center">
              <span class="font-bold text-slate-900">${c2}</span>
              <span class="text-[10px] text-slate-500">(${r2}%)</span>
            </td>
            <td class="py-2 px-2 text-center bg-amber-50/50 font-bold">
              <span class="text-army-950">${cy}</span>
              <span class="text-[10px] text-army-700 font-extrabold">(${ry}%)</span>
            </td>
            <td class="py-2 px-2 text-center ${debtInRank > 0 ? 'text-rose-700 font-bold bg-rose-50/40' : 'text-slate-400'}">
              ${debtInRank > 0 ? `${debtInRank} HV` : '0'}
            </td>
            <td class="py-2 px-2 text-center ${failsInRank > 0 ? 'text-rose-800 font-black bg-rose-50/60' : 'text-slate-400'}">
              ${failsInRank > 0 ? `${failsInRank} lượt` : '0'}
            </td>
          `;
        }).join('');

        return `
          <tr class="divide-x divide-slate-200 hover:bg-slate-50 transition">
            <td class="py-2.5 px-2 text-center text-slate-500 font-medium sticky left-0 bg-white z-10">${rIdx + 1}</td>
            <td class="py-2.5 px-3 font-bold text-slate-900 sticky left-10 bg-white z-10">
              <span class="inline-block px-2 py-0.5 rounded text-[11px] font-bold border ${item.badge}">${context.escapeHTML(item.name)}</span>
            </td>
            <td class="py-2.5 px-2 text-center font-mono text-[11px] text-slate-600">${item.standard}</td>
            ${yearCells}
          </tr>
        `;
      }).join('');

      matrixTbody.innerHTML = context.sanitizeHTML(rankMatrixRows);

      if (matrixTfoot) {
        const footCells = yearsBreakdown.map(yb => `
          <td class="py-3 px-2 text-center border-l border-slate-300 font-bold text-army-900">
            ĐTB HK1: ${yb.hk1.avgGpa}
          </td>
          <td class="py-3 px-2 text-center font-bold text-army-900">
            ĐTB HK2: ${yb.hk2.avgGpa}
          </td>
          <td class="py-3 px-2 text-center bg-amber-100/80 font-black text-army-950">
            ĐTB Năm ${yb.year}: ${yb.fullYear.avgGpa}
          </td>
          <td class="py-3 px-2 text-center bg-rose-100 font-black text-rose-800">
            ${yb.fullYear.debtStudentCount} HV rớt (${yb.fullYear.debtStudentRate}%)
          </td>
          <td class="py-3 px-2 text-center bg-rose-200 font-black text-rose-950">
            ${yb.fullYear.totalDebtFailsCount} lượt rớt
          </td>
        `).join('');

        matrixTfoot.innerHTML = context.sanitizeHTML(`
          <tr class="divide-x divide-slate-300 bg-slate-100 border-t-2 border-slate-300 text-xs">
            <td colspan="3" class="py-3 px-3 uppercase text-army-900 font-black sticky left-0 bg-slate-100 z-10">
              TỔNG HỢP ĐTB &amp; RỚT MÔN THEO TỪNG NĂM (QUÂN SỐ: ${courseStats.totalCadets} Đ/C):
            </td>
            ${footCells}
          </tr>
        `);
      }
    }

    // =========================================================================
    // BẢNG 3: DANH SÁCH HỌC VIÊN RỚT MÔN (THI LẠI / NỢ HỌC PHẦN) CẦN BỒI DƯỠNG
    // =========================================================================
    renderDebtCadetsSection();
    context.ExternalHooks?.renderWorkspaceReports?.();
  }

  function renderDebtCadetsSection(debtCadetsList = null, failedCourseDetailsList = null) {
    const escapeText = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
    const tbody = document.getElementById('reportDebtCadetsTableBody');
    const footer = document.getElementById('reportDebtCadetsFooter');
    if (!tbody) return;

    const classScope = context.getCurrentUserClassScope();
    const filterSelect = document.getElementById('reportDebtFilterClass');
    if (filterSelect) {
      if (classScope) {
        filterSelect.innerHTML = context.sanitizeHTML(`<option value="${classScope}">Lớp ${classScope}</option>`);
        filterSelect.value = classScope;
        filterSelect.disabled = true;
      } else {
        filterSelect.disabled = false;
      }
    }
    const filterClass = classScope || filterSelect?.value || 'all';
    if (filterSelect) { filterSelect.value = filterClass; filterSelect.disabled = Boolean(classScope); }

    let computedStats = null;
    if (!debtCadetsList || !failedCourseDetailsList) {
      computedStats = context.computeReportAcademicStats(context.getScopedStudents(), 'course', 1, 1);
    }

    let list = debtCadetsList || (computedStats ? computedStats.debtCadetsList : []);
    let detailRows = failedCourseDetailsList || (computedStats ? computedStats.failedCourseDetailsList : []);

    if (filterClass !== 'all') {
      list = list.filter(item => item.student.class === filterClass);
      detailRows = detailRows.filter(item => item.studentClass === filterClass);
    }

    list.sort((a, b) => b.failCount - a.failCount || a.yearGpa - b.yearGpa);

    let rowsHtml = '';
    if (list.length === 0) {
      rowsHtml = `
        <tr>
          <td colspan="9" class="py-10 text-center font-bold text-emerald-700 bg-emerald-50/40">
            ✅ Không có học viên nào rớt học phần (điểm &lt; 4.0) ${filterClass !== 'all' ? `ở lớp ${filterClass}` : 'trong toàn đơn vị'}!
          </td>
        </tr>
      `;
    } else {
      list.forEach((item, idx) => {
        const s = Object.fromEntries(['id', 'code', 'name', 'rank', 'class'].map(key => [key, escapeText(item.student[key])]));
        const debtsBadges = item.debts.map(d => {
          const fullCourseName = escapeText(context.getFullSubjectName(d.subject));
          const credits = d.subject ? d.subject.credits : 3;
          const sem = d.subject ? d.subject.semester : 1;
          return `
            <span class="inline-flex items-center gap-1.5 bg-rose-100 text-rose-900 font-bold px-2.5 py-1 rounded-md text-xs border border-rose-300 mr-1.5 mb-1 shadow-sm">
              <span>${fullCourseName} (${credits} TC • HK${sem})</span>
              <span class="bg-rose-600 text-white px-1.5 py-0.2 rounded text-[10px] font-black" title="Điểm học phần: ${Number(d.score).toFixed(2)}">Điểm: ${Number(d.score).toFixed(2)}</span>
            </span>
          `;
        }).join('');

        rowsHtml += `
          <tr class="hover:bg-slate-50 transition">
            <td class="py-2.5 px-3 text-center text-slate-500 font-medium">${idx + 1}</td>
            <td class="py-2.5 px-3 font-mono font-bold">
              <button type="button" class="btn-view-cadet-detail text-army-800 hover:text-gold-600 hover:underline" data-id="${s.id}">
                ${context.escapeHTML(s.code)}
              </button>
            </td>
            <td class="py-2.5 px-4 font-bold text-slate-900">
              <button type="button" class="btn-view-cadet-detail hover:text-army-800 hover:underline text-left font-bold" data-id="${s.id}">
                ${context.escapeHTML(s.name)}
              </button>
            </td>
            <td class="py-2.5 px-2 text-center text-slate-600">${context.escapeHTML(s.rank)}</td>
            <td class="py-2.5 px-2 text-center font-bold text-army-800">${context.escapeHTML(s.class)}</td>
            <td class="py-2.5 px-4">${debtsBadges}</td>
            <td class="py-2.5 px-3 text-center font-black bg-rose-50 text-rose-700 text-sm">
              <span class="px-2.5 py-0.5 rounded-full bg-rose-200 text-rose-950 font-black">${item.failCount} học phần</span>
            </td>
            <td class="py-2.5 px-4 text-[11px] text-slate-700 leading-relaxed">
              Phân công Cán sự lớp <strong>${context.escapeHTML(s.class)}</strong> kèm cặp; duy trì tự học tối; đăng ký ôn và thi lại học phần.
            </td>
            <td class="py-2.5 px-3 text-center">
              <button type="button" class="btn-open-transcript px-2.5 py-1 rounded bg-army-700 hover:bg-army-800 text-white font-semibold text-[11px] shadow-sm transition" data-id="${s.id}">
                Phiếu Điểm
              </button>
            </td>
          </tr>
        `;
      });
    }
    tbody.innerHTML = context.sanitizeHTML(rowsHtml);

    if (footer) {
      const totalFailsInFilter = list.reduce((sum, item) => sum + item.failCount, 0);
      footer.innerHTML = context.sanitizeHTML(`
        <span>Tổng số học viên rớt môn: <strong class="text-rose-700">${list.length} học viên</strong> • Tổng số lượt rớt: <strong class="text-rose-800">${totalFailsInFilter} lượt học phần (&lt; 4.0)</strong></span>
        <span class="text-[11px] text-slate-500 italic">Hiển thị đầy đủ Tên môn học (không viết tắt) &amp; Điểm số cụ thể</span>
      `);
    }
  }

  /**
   * Xuất file Báo cáo Tình hình Học tập (exportReportExcel):
   * - Chuẩn hóa hiển thị đầy đủ Tên môn học (tuyệt đối không dùng tên viết tắt hay mã môn).
   * - Bao gồm đầy đủ 3 bảng và các chỉ số:
   *   1. Bảng 1: Tỷ lệ Tích lũy (7 mức Xuất sắc, Giỏi, Khá, Trung bình khá, Trung bình, Yếu, Kém + tỷ lệ đạt/rớt từ đầu khóa đến nay)
   *   2. Bảng 2: Tỷ lệ theo Từng Năm & Từng Học kỳ: Năm 1 (HK1, HK2, Cả năm, Số học viên rớt môn, Số lượt rớt) -> Năm 2 -> Năm 3 -> Năm 4 -> Năm 5
   *   3. Bảng 3: Danh sách Học viên Rớt môn (Thi lại / Nợ học phần) Cần Bồi dưỡng & Chi tiết cụ thể từng học viên bị rớt môn nào (Tên môn đầy đủ, học kỳ, số tín chỉ, điểm số).
   */

  return { renderDashboard, renderDebtCadetsSection };
}
