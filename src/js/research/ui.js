import { escapeHTML as esc, sanitizeHTML } from '../safe-html.js';
import { AWARDS, actor, participants, leaderClass, canView, canEdit, canAward, canCreate, scopedProjects, researchStats, yearGPA, EXCEL_HEADERS, EXPORT_HEADERS, normalizeAwards, parseResearchRows } from './model.js';
import { createResearchStore } from './store.js';

export function mountResearch({ state, classes, subjectsForClass, notify }) {
  const $ = id => document.getElementById(id);
  const root = $('tab-research'), editor = $('researchEditor'), importDialog = $('researchImportDialog'), uploadDialog = $('researchUploadDialog'), exportDialog = $('researchExportDialog');
  if (!root || root.dataset.mounted) return;
  root.dataset.mounted = 'true';
  const store = createResearchStore(() => state);
  let projects = [], loaded = false, loading = false, error = '', filter = 'all', editing = null, draftId = '', importing = [], busy = false, identity = '', generation = 0;
  const identityKey = () => JSON.stringify([state.role, state.currentUser?.studentId, state.currentUser?.code]);
  const setHTML = (element, html) => { element.innerHTML = sanitizeHTML(html); };
  const button = (label, action, id) => `<button type="button" class="research-btn" data-research-action="${action}" data-project-id="${esc(id)}">${label}</button>`;
  const studentLine = (student, project) => `<div class="research-person">${esc(student.name || student.code)}${student.studentId === project.leaderId ? ' <span class="research-owner">Chủ đề tài</span>' : ''}</div>`;
  const blankGuides = (project, values) => project.advisors?.length ? `<div class="research-guide-label" aria-hidden="true">&nbsp;</div>${project.advisors.map((a, i) => `<div class="research-person">${esc(values(a, i))}</div>`).join('')}` : '';
  function render() {
    const key = identityKey();
    if (key !== identity) {
      identity = key; filter = 'all'; generation++; projects = []; loaded = false; error = ''; loading = false;
      if (editor.open) editor.close();
      if (importDialog.open) importDialog.close();
      if (uploadDialog.open) uploadDialog.close();
      if (exportDialog.open) exportDialog.close();
      importing = [];
    }
    if (editor.open || importDialog.open || uploadDialog.open) return;
    const global = ['admin', 'company_officer'].includes(state.role), visible = scopedProjects(projects, state, filter);
    const stats = researchStats(visible);
    $('researchTopicCount').textContent = loaded ? stats.projects : '—';
    $('researchStudentCount').textContent = loaded ? stats.students : '—';
    $('researchScope').textContent = global ? (filter === 'all' ? 'Toàn đại đội · Xếp theo lớp của chủ đề tài' : `Chủ đề tài thuộc lớp ${filter}`) : actor(state).className ? `Đề tài có học viên lớp ${actor(state).className} tham gia` : 'Đề tài bạn tham gia';
    $('researchClassTabs').hidden = !global;
    setHTML($('researchClassTabs'), global ? ['all', ...classes].map(cls => `<button type="button" role="tab" aria-selected="${filter === cls}" data-research-class="${cls}">${cls === 'all' ? 'Tất cả' : esc(cls)}</button>`).join('') : '');
    $('researchImport').hidden = !canCreate(state);
    $('researchExport').disabled = loading;
    $('researchReportCard').hidden = state.role === 'guest';
    $('researchStatus').textContent = error || (loading ? 'Đang tải đề tài…' : !loaded ? 'Mở mục này để tải đề tài.' : `${visible.length} đề tài`);
    $('researchStatus').title = 'Điểm TBNH tính theo năm học của đề tài; học viên được đếm không trùng.';
    $('researchStatus').setAttribute('role', error ? 'alert' : 'status');
    if (error) { const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'research-btn'; retry.dataset.researchRetry = 'true'; retry.textContent = 'Thử lại'; $('researchStatus').append(' ', retry); }
    setHTML($('researchTableBody'), !loaded ? '<tr><td colspan="9" class="research-empty">Chưa tải được danh sách đề tài.</td></tr>' : !visible.length ? '<tr><td colspan="9" class="research-empty">Chưa có đề tài trong phạm vi này.</td></tr>' : visible.map((project, i) => {
      const people = participants(project, state.students);
      const gpas = people.map(p => yearGPA(p, state, project.year, subjectsForClass(p.class)));
      const awards = `<div class="research-award-list">${AWARDS.map(a => `<label class="research-award-check"><input type="checkbox" data-research-award="${esc(a)}" data-project-id="${esc(project.id)}" aria-label="${esc(a + ': ' + project.title)}" ${normalizeAwards(project.awards || []).includes(a) ? 'checked' : ''} ${canAward(project, state) ? '' : 'disabled'}><span>${esc(a)}</span></label>`).join('')}</div>`;
      return `<tr><td>${i + 1}</td><td class="research-topic">${canEdit(project, state) || canAward(project, state) ? button(esc(project.title), 'edit', project.id) : `<strong>${esc(project.title)}</strong>`}<small>Năm ${project.year} · ${esc(leaderClass(project, state.students))}</small></td><td class="research-description"><b>Mục tiêu:</b><p>${esc(project.objective || 'Chưa cập nhật')}</p><b>Nội dung nghiên cứu:</b><p>${esc(project.content || 'Chưa cập nhật')}</p><b>Sản phẩm dự kiến:</b><p>${esc(project.product || 'Chưa cập nhật')}</p></td><td class="research-people"><b class="research-guide-label">Học viên thực hiện:</b>${people.map(p => studentLine(p, project)).join('')}${project.advisors?.length ? '<b class="research-guide-label">Cán bộ hướng dẫn:</b>' + project.advisors.map(a => `<div class="research-person">${esc(a.name)}</div>`).join('') : ''}</td><td><div class="research-guide-label" aria-hidden="true">&nbsp;</div>${people.map(p => `<div class="research-person">${esc(p.class || '—')}/c460/d4</div>`).join('')}${blankGuides(project, a => a.unit || '—')}</td><td><div class="research-guide-label" aria-hidden="true">&nbsp;</div>${gpas.map(g => `<div class="research-person">${g === null ? '—' : g.toFixed(2).replace('.', ',')}</div>`).join('')}${blankGuides(project, () => '—')}</td><td><div class="research-guide-label" aria-hidden="true">&nbsp;</div>${people.map(p => `<div class="research-person">${esc(p.code || '—')}</div>`).join('')}${blankGuides(project, () => '—')}</td><td>${awards}</td><td class="research-notes">${esc(project.notes || '—')}</td></tr>`;
    }).join(''));
  }
  async function reload() {
    render();
    if (loading || state.role === 'guest') return;
    loading = true; error = ''; const token = generation;
    render();
    try { const result = await store.load(); if (token === generation) { projects = result; loaded = true; } }
    catch (e) { if (token === generation) { error = e.message; loaded = false; } }
    finally { if (token === generation) { loading = false; render(); } }
  }
  function options(selected, onlyLeader = false) {
    const user = actor(state);
    return state.students.filter(s => !onlyLeader || state.role === 'admin' || user.className && s.class === user.className || state.role === 'student' && s.id === user.studentId)
      .map(s => `<option value="${esc(s.id)}" ${s.id === selected ? 'selected' : ''}>${esc(s.name)} · ${esc(s.code)} · ${esc(s.class)}</option>`).join('');
  }
  function openEditor(project = null) {
    if (!loaded || (project ? !canView(project, state) || !canEdit(project, state) && !canAward(project, state) : !canCreate(state))) return;
    editing = project ? structuredClone(project) : null;
    draftId = project?.id || crypto.randomUUID();
    const infoAllowed = !project || canEdit(project, state);
    $('researchEditorTitle').textContent = project ? infoAllowed ? 'Chỉnh sửa đề tài' : 'Cập nhật giải thưởng' : 'Thêm đề tài';
    $('researchForm').reset(); $('researchFormError').textContent = '';
    $('researchInfoFields').disabled = !infoAllowed;
    const leader = project?.leaderId || (state.role === 'student' ? actor(state).studentId : '');
    setHTML($('researchLeader'), '<option value="">Chọn chủ đề tài</option>' + options(leader, true));
    // An award-only class account must still see the owner from another class.
    if (leader && !$('researchLeader').value) setHTML($('researchLeader'), options(leader));
    $('researchTitle').value = project?.title || '';
    $('researchYear').value = project?.year || '1';
    $('researchObjective').value = project?.objective || '';
    $('researchContent').value = project?.content || '';
    $('researchNotes').value = project?.notes || '';
    $('researchProduct').value = project?.product || '';
    $('researchAdvisors').value = (project?.advisors || []).map(a => a.name + (a.unit ? ' | ' + a.unit : '')).join('\n');
    const selected = new Set(project?.participants.map(p => p.studentId) || (leader ? [leader] : []));
    setHTML($('researchMembers'), state.students.map(s => `<label data-member-search="${esc((s.name + ' ' + s.code + ' ' + s.class).toLocaleLowerCase('vi'))}"><input type="checkbox" name="researchMember" value="${esc(s.id)}" ${selected.has(s.id) ? 'checked' : ''}><span>${esc(s.name)}<small>${esc(s.code)} · ${esc(s.class)}</small></span></label>`).join(''));
    setHTML($('researchAwards'), AWARDS.map(a => `<label><input type="checkbox" name="researchAward" value="${esc(a)}" ${normalizeAwards(project?.awards || []).includes(a) ? 'checked' : ''}>${esc(a)}</label>`).join(''));
    $('researchAwardFields').disabled = project ? !canAward(project, state) : state.role === 'student';
    $('researchAwardNote').textContent = $('researchAwardFields').disabled ? 'Chỉ Admin và tài khoản lớp được cập nhật giải thưởng.' : 'Tích chọn các mục giải thưởng.';
    editor.showModal(); $('researchTitle').focus();
  }
  function formInput() {
    return { id: draftId, title: $('researchTitle').value, year: $('researchYear').value,
      notes: $('researchNotes').value, objective: $('researchObjective').value, content: $('researchContent').value, product: $('researchProduct').value,
      leaderId: $('researchLeader').value, memberIds: [...document.querySelectorAll('[name="researchMember"]:checked')].map(el => el.value),
      advisors: $('researchAdvisors').value.split('\n').filter(line => line.trim()).map(line => { const [name, ...unit] = line.split('|'); return { name, unit: unit.join('|') }; }),
      awards: [...document.querySelectorAll('[name="researchAward"]:checked')].map(el => el.value) };
  }
  function replaceProject(saved) {
    const index = projects.findIndex(p => p.id === saved.id);
    if (index < 0) projects.push(saved); else projects[index] = saved;
    projects.sort((a, b) => a.id.localeCompare(b.id));
  }
  $('researchForm').addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    busy = true; const user = identityKey(), input = formInput();
    $('researchSave').disabled = true; $('researchSave').setAttribute('aria-busy', 'true'); $('researchFormError').textContent = '';
    try {
      const saved = await store.save(input, editing);
      if (user !== identityKey()) return;
      replaceProject(saved); editor.close(); render(); notify('Đã lưu đề tài nghiên cứu khoa học.', 'success');
    } catch (e) { $('researchFormError').textContent = e.message; }
    finally { busy = false; $('researchSave').disabled = false; $('researchSave').removeAttribute('aria-busy'); }
  });
  $('researchLeader').addEventListener('change', () => {
    const checkbox = [...document.querySelectorAll('[name="researchMember"]')].find(el => el.value === $('researchLeader').value);
    if (checkbox) checkbox.checked = true;
  });
  $('researchMemberSearch').addEventListener('input', event => {
    const term = event.target.value.toLocaleLowerCase('vi').trim();
    $('researchMembers').querySelectorAll('label').forEach(label => { label.hidden = !label.dataset.memberSearch.includes(term); });
  });
  editor.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  importDialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  uploadDialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  document.querySelectorAll('[data-research-close]').forEach(btn => btn.addEventListener('click', () => { if (!busy) btn.closest('dialog').close(); }));
  root.addEventListener('click', event => {
    if (event.target.closest('[data-research-retry]')) { reload(); return; }
    const tab = event.target.closest('[data-research-class]');
    if (tab) { filter = tab.dataset.researchClass; render(); }
    const action = event.target.closest('[data-research-action]');
    if (action?.dataset.researchAction === 'edit') openEditor(projects.find(p => p.id === action.dataset.projectId));
  });
  root.addEventListener('change', async event => {
    const checkbox = event.target.closest('[data-research-award]');
    if (!checkbox) return;
    const project = projects.find(p => p.id === checkbox.dataset.projectId);
    if (!project || !canAward(project, state)) { render(); return; }
    const key = identityKey(), selected = new Set(normalizeAwards(project.awards));
    if (checkbox.checked) selected.add(checkbox.dataset.researchAward); else selected.delete(checkbox.dataset.researchAward);
    const row = checkbox.closest('tr'); row.setAttribute('aria-busy', 'true');
    row.querySelectorAll('[data-research-award]').forEach(el => { el.disabled = true; });
    try {
      const saved = await store.save({ ...project, awards: AWARDS.filter(a => selected.has(a)) }, project);
      if (key === identityKey()) { replaceProject(saved); render(); }
    } catch (error) { if (key === identityKey()) { notify(error.message, 'error'); render(); } }
  });
  $('researchManual').addEventListener('click', () => { if (!busy) { uploadDialog.close(); openEditor(); } });
  $('researchChooseFile').addEventListener('click', () => { if (!busy) $('researchFile').click(); });
  const requireXLSX = () => { if (!window.XLSX) throw new Error('Thư viện Excel chưa tải được. Kiểm tra kết nối rồi thử lại.'); return window.XLSX; };
  function writeWorkbook(rows, filename) {
    const XLSX = requireXLSX(), sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet['!cols'] = rows[0].map((_, i) => ({ wch: i === 0 ? 8 : i === 1 ? 28 : 42 }));
    const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, 'Nghien_Cuu_Khoa_Hoc'); XLSX.writeFile(book, filename);
  }
  $('researchTemplate').addEventListener('click', () => {
    try { writeWorkbook([EXCEL_HEADERS, [1, 'VD-NCKH-01', 'Ví dụ: Nâng cao kỹ năng đọc hiểu tiếng Nga', 'MA_HV_01', 'MA_HV_01; MA_HV_02', 'Nguyễn Văn A | K13; Trần Thị B | K13']], 'Mau_Nghien_Cuu_Khoa_Hoc.xlsx'); notify('Đã tải mẫu có ví dụ. Thay dòng ví dụ và mã học viên bằng dữ liệu của bạn trước khi nhập.', 'info'); }
    catch (e) { notify(e.message, 'error'); }
  });
  $('researchExport').addEventListener('click', async () => {
    if (loading || state.role === 'guest') return;
    await reload();
    if (!loaded) { notify(error || 'Chưa tải được đề tài.', 'error'); return; }
    const global = ['admin', 'company_officer'].includes(state.role);
    $('researchExportClassLabel').hidden = !global;
    setHTML($('researchExportClass'), ['all', ...classes].map(cls => `<option value="${cls}">${cls === 'all' ? 'Toàn đại đội' : 'Lớp ' + esc(cls)}</option>`).join(''));
    $('researchExportScope').textContent = global ? 'Lọc theo lớp của chủ đề tài hoặc xuất toàn đại đội.' : actor(state).className ? `Xuất các đề tài có học viên lớp ${actor(state).className} tham gia.` : 'Xuất các đề tài bạn tham gia.';
    $('researchExportError').textContent = '';
    exportDialog.showModal();
  });
  $('researchExportForm').addEventListener('submit', event => {
    event.preventDefault();
    try {
      const selected = ['admin', 'company_officer'].includes(state.role) ? $('researchExportClass').value : 'all';
      const visible = scopedProjects(projects, state, selected);
      if (!visible.length) throw new Error('Chưa có đề tài trong phạm vi này.');
      writeWorkbook([EXPORT_HEADERS, ...visible.map((p, i) => [i + 1, p.projectCode || p.id, p.title, participants(p, state.students).find(s => s.studentId === p.leaderId)?.code || '', participants(p, state.students).map(s => s.code).join('; '), p.advisors.map(a => a.name + ' | ' + a.unit).join('; '), p.objective, p.content, p.product, p.year, normalizeAwards(p.awards).join('; '), p.notes || ''])], 'De_Tai_Nghien_Cuu_Khoa_Hoc.xlsx');
      exportDialog.close();
    } catch (e) { $('researchExportError').textContent = e.message; }
  });
  $('researchImport').addEventListener('click', async () => {
    if (!canCreate(state)) return;
    if (!loaded) await reload();
    if (!loaded) return;
    $('researchUploadStatus').textContent = '';
    uploadDialog.showModal();
  });
  let dragDepth = 0;
  const dropZone = $('researchDropZone');
  dropZone.addEventListener('dragenter', event => { event.preventDefault(); if (!busy) { dragDepth++; dropZone.classList.add('is-over'); } });
  dropZone.addEventListener('dragover', event => { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = busy ? 'none' : 'copy'; });
  dropZone.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; dropZone.classList.remove('is-over'); } });
  dropZone.addEventListener('drop', event => {
    event.preventDefault(); dragDepth = 0; dropZone.classList.remove('is-over');
    if (busy || !canCreate(state)) return;
    const files = event.dataTransfer?.files;
    if (!files?.length) return;
    if (files.length !== 1) { $('researchUploadStatus').textContent = 'Chỉ nhận một file mỗi lần.'; return; }
    const transfer = new DataTransfer(); transfer.items.add(files[0]); $('researchFile').files = transfer.files;
    $('researchFile').dispatchEvent(new Event('change', { bubbles: true }));
  });
  $('researchFile').addEventListener('change', async event => {
    const file = event.target.files[0]; event.target.value = ''; if (!file || busy || !canCreate(state)) return;
    const user = identityKey(); busy = true; $('researchChooseFile').disabled = true;
    $('researchUploadStatus').textContent = 'Đang đọc và kiểm tra file…';
    try {
      if (!/\.(xlsx|xls)$/i.test(file.name) || file.size === 0) throw new Error('Chọn một file .xlsx hoặc .xls có dữ liệu.');
      if (file.size > 10 * 1024 * 1024) throw new Error('File tối đa 10 MB.');
      const XLSX = requireXLSX(), workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      if (!canCreate(state) || user !== identityKey()) return;
      importing = parseResearchRows(XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: '' }), state, projects, () => crypto.randomUUID());
      $('researchImportSummary').textContent = `${importing.length} đề tài: ${importing.filter(x => !x.existing).length} thêm mới, ${importing.filter(x => x.existing).length} cập nhật. Kiểm tra trước khi xác nhận.`;
      setHTML($('researchImportRows'), importing.map((d, i) => `<tr><td>${i + 1}</td><td>${esc(d.project.title)}</td><td>${d.project.participants.length}</td><td>${esc(leaderClass(d.project, state.students))}</td><td data-import-status="${i}">Chờ xác nhận</td></tr>`).join(''));
      $('researchImportConfirm').disabled = false; $('researchImportResult').textContent = '';
      uploadDialog.close(); importDialog.showModal();
    } catch (e) { importing = []; $('researchUploadStatus').textContent = e.message; notify(e.message, 'error'); }
    finally { busy = false; $('researchChooseFile').disabled = false; }
  });
  $('researchImportConfirm').addEventListener('click', async () => {
    if (busy || !importing.length || !canCreate(state)) return;
    busy = true; $('researchImportConfirm').disabled = true; $('researchImportConfirm').setAttribute('aria-busy', 'true');
    const key = identityKey(); let success = 0, failed = 0;
    // Every row was validated before the first write. Each project is saved independently.
    for (const [index, draft] of importing.entries()) {
      if (key !== identityKey()) break;
      const status = document.querySelector(`[data-import-status="${index}"]`);
      try { const saved = await store.save(draft.project, draft.existing); replaceProject(saved); success++; status.textContent = 'Đã lưu'; }
      catch (e) { failed++; status.textContent = e.message; }
    }
    $('researchImportResult').textContent = `${success} thành công, ${failed} chưa xác nhận. ${failed ? 'Các đề tài thành công đã được lưu. Đóng rồi mở lại mục Nghiên cứu khoa học để kiểm tra trước khi nhập lại; không gửi lại cả file.' : 'Đóng để xem danh sách.'}`;
    busy = false; $('researchImportConfirm').removeAttribute('aria-busy');
  });
  importDialog.addEventListener('close', () => { importing = []; render(); });
  editor.addEventListener('close', render);
  window.addEventListener('research-context-change', () => {
    render();
    if (state.activeTab === 'tab-research') reload();
  });
  return { render: () => { render(); if (state.activeTab === 'tab-research' && !loaded && !loading && !error) reload(); } };
}
