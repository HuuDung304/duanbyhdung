// Dependencies are injected by grades.js; this module does not import the application shell.
export function createTranscript(context) {
  function openTranscriptModal(studentId) {
    if (context.AppState.role === 'student') {
      const selfStudent = context.getLoggedInStudent();
      if (!selfStudent || selfStudent.id !== studentId) {
        context.showToast('Bảo mật: Học viên chỉ được phép xem phiếu điểm tích lũy của chính mình!', 'error');
        return;
      }
    }

    const student = context.AppState.students.find(s => s.id === studentId);
    if (!student) return;

    const classScope = context.getCurrentUserClassScope();
    if (classScope && student.class !== classScope) {
      context.showToast(`Tài khoản Lớp ${classScope} không được phép truy cập dữ liệu của lớp khác!`, 'error');
      return;
    }

    const gpa10 = context.calculateYearGPA(student.id);
    const gpa4 = context.calculateCumulativeGPA4(student.id);
    const passedTC = context.calculateCreditsPassed(student.id);
    const totalCourseTC = context.getTotalCourseCredits(student.class);
    const rank = context.getClassification(gpa10);
    const pos = student.position || student.role || 'Học viên';

    document.getElementById('transcriptModalTitle').textContent = `Phiếu Điểm Tích Lũy: ${student.name}`;
    document.getElementById('tcName').textContent = student.name;
    document.getElementById('tcCode').textContent = student.code;
    document.getElementById('tcClass').textContent = `${student.class} • ${pos}`;
    document.getElementById('tcRank').textContent = `${student.rank} • Ngoại ngữ: ${context.evaluateLangLevelStatus(student.currentLangLevel).actualLevel}`;

    document.getElementById('tcGpa10').textContent = gpa10.toFixed(2);
    document.getElementById('tcGpa4').textContent = `${gpa4.toFixed(2)} / 4.00`;
    document.getElementById('tcCredits').textContent = `${passedTC} / ${totalCourseTC} TC`;
    document.getElementById('tcClassification').textContent = rank;

    const studentGrades = context.AppState.grades[student.id] || {};
    const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
    const hasRecordedScore = subject => {
      const score = studentGrades[subject.id];
      return score !== undefined && score !== null && String(score).trim() !== '' && Number.isFinite(Number(score)) && Number(score) >= 0 && Number(score) <= 10;
    };
    const renderSubjRow = (sub, idx) => {
      const sc10 = studentGrades[sub.id];
      const hasScore = sc10 !== undefined && sc10 !== null && sc10 !== '' && !isNaN(sc10);
      const { letter, scale4, status } = context.getGradeLetterAndScale4(sc10);
      const sc4 = hasScore ? scale4.toFixed(1) : '-';
      const isFail = hasScore && Number(sc10) < 4.0;

      return `
        <tr class="hover:bg-slate-50 ${isFail ? 'bg-rose-50/50' : ''}">
          <td class="p-2 text-center text-slate-500">${idx + 1}</td>
          <td class="p-2 font-mono font-bold text-slate-700">${escape(sub.code)}</td>
          <td class="p-2 font-medium text-slate-900">${escape(context.getFullSubjectName(sub))} ${sub.category === 'specialized' ? `<span class="text-[10px] font-bold text-amber-800">(Lớp ${escape(sub.targetClass)})</span>` : ''}</td>
          <td class="p-2 text-center font-bold text-gold-600">${Number(sub.credits) || 0}</td>
          <td class="p-2 text-center font-bold ${isFail ? 'text-rose-700 font-black' : 'text-slate-800'}">${hasScore ? Number(sc10).toFixed(2) : '-'}</td>
          <td class="p-2 text-center font-black ${isFail ? 'text-rose-700' : 'text-army-800'}">${letter}</td>
          <td class="p-2 text-center font-bold text-blue-800">${sc4}</td>
          <td class="p-2 text-center">
            <span class="px-2 py-0.5 rounded text-[10px] font-bold ${isFail ? 'bg-rose-100 text-rose-800' : hasScore ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}">
              ${status}
            </span>
          </td>
        </tr>
      `;
    };

    const extra = document.getElementById('tcExtraSemestersContainer');
    extra.replaceChildren();
    const tableHeader = document.getElementById('tcHk1TableBody').closest('table').querySelector('thead').outerHTML;
    let visibleSemesters = 0, recordedCredits = 0;
    for (let semester = 1; semester <= 10; semester++) {
      const subjects = context.getSubjectsForClass(student.class, semester).filter(hasRecordedScore);
      const credits = subjects.reduce((sum, subject) => sum + (Number(subject.credits) || 0), 0);
      let section;
      if (semester <= 2) {
        section = document.getElementById(`tcHk${semester}TableBody`).closest('table').parentElement;
      } else if (subjects.length) {
        section = document.createElement('div'); section.className = 'space-y-2';
        section.innerHTML = context.sanitizeHTML(`<div class="flex flex-wrap items-center justify-between gap-2 border-b pb-1"><h4 class="font-bold text-army-900 uppercase"></h4><span id="tcHk${semester}Summary" class="text-[11px] font-semibold text-slate-600"></span></div><table class="w-full text-xs text-left border-collapse border border-slate-200">${tableHeader}<tbody id="tcHk${semester}TableBody" class="divide-y divide-slate-100"></tbody></table>`);
        extra.append(section);
      }
      if (!section) continue;
      section.dataset.semester = String(semester);
      section.hidden = !subjects.length;
      const tbody = section.querySelector('tbody');
      tbody.innerHTML = context.sanitizeHTML(subjects.map(renderSubjRow).join(''));
      if (!subjects.length) continue;
      visibleSemesters++; recordedCredits += credits;
      section.querySelector('h4').textContent = `Học kỳ ${semester} (${credits} tín chỉ đã có điểm)`;
      document.getElementById(`tcHk${semester}Summary`).textContent = `ĐTB HK${semester} (10): ${context.calculateSemesterGPA(student.id, semester).toFixed(2)}`;
    }
    document.getElementById('tcNoGradedSubjects').hidden = visibleSemesters > 0;
    document.getElementById('transcriptModalSubtitle').textContent = `Các học phần đã có điểm • ${recordedCredits} tín chỉ`;

    context.showModal('modalTranscriptDetail');
  }


  return { openTranscriptModal };
}
