import { escapeHTML as esc, sanitizeHTML } from '../safe-html.js';
import { AWARDS, actor, participants, leaderClass, canView, canEdit, canAward, canCreate, scopedProjects, researchStats, yearGPA, EXCEL_HEADERS, parseResearchRows } from './model.js';
import { createResearchStore } from './store.js';

export function mountResearch({ state, classes, subjectsForClass, notify }) {
  const $ = id => document.getElementById(id);
  const root = $('tab-research'), editor = $('researchEditor'), importDialog = $('researchImportDialog');
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
      importing = [];
    }
    if (editor.open || importDialog.open) return;
    const global = ['admin', 'company_officer'].includes(state.role), visible = scopedProjects(projects, state, filter);
    const stats = researchStats(visible);
    $('researchTopicCount').textContent = loaded ? stats.projects : '—';
    $('researchStudentCount').textContent = loaded ? stats.students : '—';
    $('researchScope').textContent = global ? (filter === 'all' ? 'Toàn đại đội · Xếp theo lớp của chủ đề tài' : `Chủ đề tài thuộc lớp ${filter}`) : actor(state).className ? `Đề tài có học viên lớp ${actor(state).className} tham gia` : 'Đề tài bạn tham gia';
    $('researchClassTabs').hidden = !global;
    setHTML($('researchClassTabs'), global ? ['all', ...classes].map(cls => `<button type="button" role="tab" aria-selected="${filter === cls}" data-research-class="${cls}">${cls === 'all' ? 'Tất cả' : esc(cls)}</button>`).join('') : '');
    $('researchAdd').hidden = !canCreate(state);
    $('researchImport').hidden = !canCreate(state);
    $('researchExport').disabled = !loaded || !visible.length;
    $('researchReload').disabled = loading;
    $('researchStatus').textContent = error || (loading ? 'Đang tải đề tài…' : !loaded ? 'Mở mục này để tải đề tài.' : `${visible.length} đề tài · Điểm TBNH tính theo năm học của từng đề tài; học viên được đếm không trùng.`);
    $('researchStatus').setAttribute('role', error ? 'alert' : 'status');
    setHTML($('researchTableBody'), !loaded ? '<tr><td colspan="9" class="research-empty">Chưa tải được danh sách đề tài.</td></tr>' : !visible.length ? '<tr><td colspan="9" class="research-empty">Chưa có đề tài trong phạm vi này.</td></tr>' : visible.map((project, i) => {
      const people = participants(project, state.students);
      const gpas = people.map(p => yearGPA(p, state, project.year, subjectsForClass(p.class)));
      const awards = (project.awards || []).map(a => `<span class="research-award">${esc(a)}</span>`).join('') || '<span class="research-muted">Chưa có</span>';
      return `<tr><td>${i + 1}</td><td class="research-topic"><strong>${esc(project.title)}</strong><small>Năm ${project.year} · ${esc(leaderClass(project, state.students))}</small></td><td class="research-description"><b>Mục tiêu:</b><p>${esc(project.objective || 'Chưa cập nhật')}</p><b>Nội dung nghiên cứu:</b><p>${esc(project.content || 'Chưa cập nhật')}</p><b>Sản phẩm dự kiến:</b><p>${esc(project.product || 'Chưa cập nhật')}</p></td><td class="research-people"><b class="research-guide-label">Học viên thực hiện:</b>${people.map(p => studentLine(p, project)).join('')}${project.advisors?.length ? '<b class="research-guide-label">Cán bộ hướng dẫn:</b>' + project.advisors.map(a => `<div class="research-person">${esc(a.name)}</div>`).join('') : ''}</td><td><div class="research-guide-label" aria-hidden="true">&nbsp;</div>${people.map(p => `<div class="research-person">${esc(p.class || '—')}/c460/d4</div>`).join('')}${blankGuides(project, a => a.unit || '—')}</td><td><div class="research-guide-label" aria-hidden="true">&nbsp;</div>${gpas.map(g => `<div class="research-person">${g === null ? '—' : g.toFixed(2).replace('.', ',')}</div>`).join('')}${blankGuides(project, () => '—')}</td><td><div class="research-guide-label" aria-hidden="true">&nbsp;</div>${people.map(p => `<div class="research-person">${esc(p.code || '—')}</div>`).join('')}${blankGuides(project, () => '—')}</td><td>${awards}</td><td>${canEdit(project, state) ? button('Chỉnh sửa', 'edit', project.id) : canAward(project, state) ? button('Giải thưởng', 'edit', project.id) : '<span class="research-muted">Chỉ xem</span>'}</td></tr>`;
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
    $('researchEditorTitle').textContent = project ? infoAllowed ? 'Chỉnh sửa đề tài' : 'Cập nhật giải thưởng' : 'Thêm đề tài nghiên cứu khoa học';
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
    $('researchProduct').value = project?.product || '';
    $('researchAdvisors').value = (project?.advisors || []).map(a => a.name + (a.unit ? ' | ' + a.unit : '')).join('\n');
    const selected = new Set(project?.participants.map(p => p.studentId) || (leader ? [leader] : []));
    setHTML($('researchMembers'), state.students.map(s => `<label data-member-search="${esc((s.name + ' ' + s.code + ' ' + s.class).toLocaleLowerCase('vi'))}"><input type="checkbox" name="researchMember" value="${esc(s.id)}" ${selected.has(s.id) ? 'checked' : ''}><span>${esc(s.name)}<small>${esc(s.code)} · ${esc(s.class)}</small></span></label>`).join(''));
    setHTML($('researchAwards'), AWARDS.map(a => `<label><input type="checkbox" name="researchAward" value="${esc(a)}" ${(project?.awards || []).includes(a) ? 'checked' : ''}>${esc(a)}</label>`).join(''));
    $('researchAwardFields').disabled = project ? !canAward(project, state) : state.role === 'student';
    $('researchAwardNote').textContent = $('researchAwardFields').disabled ? 'Chỉ Admin và tài khoản lớp được cập nhật giải thưởng.' : 'Có thể chọn khen thưởng và tối đa một loại xếp loại.';
    editor.showModal(); $('researchTitle').focus();
  }
  function formInput() {
    return { id: draftId, title: $('researchTitle').value, year: $('researchYear').value,
      objective: $('researchObjective').value, content: $('researchContent').value, product: $('researchProduct').value,
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
  $('researchAwards').addEventListener('change', event => {
    if (event.target.checked && event.target.value.startsWith('Loại ')) document.querySelectorAll('[name="researchAward"]').forEach(el => { if (el !== event.target && el.value.startsWith('Loại ')) el.checked = false; });
  });
  editor.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  importDialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  document.querySelectorAll('[data-research-close]').forEach(btn => btn.addEventListener('click', () => { if (!busy) btn.closest('dialog').close(); }));
  root.addEventListener('click', event => {
    const tab = event.target.closest('[data-research-class]');
    if (tab) { filter = tab.dataset.researchClass; render(); }
    const action = event.target.closest('[data-research-action]');
    if (action?.dataset.researchAction === 'edit') openEditor(projects.find(p => p.id === action.dataset.projectId));
  });
  $('researchReload').addEventListener('click', reload);
  $('researchAdd').addEventListener('click', () => openEditor());
  const requireXLSX = () => { if (!window.XLSX) throw new Error('Thư viện Excel chưa tải được. Kiểm tra kết nối rồi thử lại.'); return window.XLSX; };
  function writeWorkbook(rows, filename) {
    const XLSX = requireXLSX(), sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet['!cols'] = EXCEL_HEADERS.map((_, i) => ({ wch: [38, 48, 48, 60, 42, 22, 45, 48, 12, 38][i] }));
    const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, 'Nghien_Cuu_Khoa_Hoc'); XLSX.writeFile(book, filename);
  }
  $('researchTemplate').addEventListener('click', () => {
    try { writeWorkbook([EXCEL_HEADERS], 'Mau_Nghien_Cuu_Khoa_Hoc.xlsx'); notify('File mẫu đã tải. Mỗi dòng là một đề tài; nhập mã học viên đang có trong Hồ sơ quân nhân.', 'info'); }
    catch (e) { notify(e.message, 'error'); }
  });
  $('researchExport').addEventListener('click', () => {
    try { writeWorkbook([EXCEL_HEADERS, ...scopedProjects(projects, state, filter).map(p => [p.id, p.title, p.objective, p.content, p.product, participants(p, state.students).find(s => s.studentId === p.leaderId)?.code || '', participants(p, state.students).map(s => s.code).join('; '), p.advisors.map(a => a.name + ' | ' + a.unit).join('\n'), p.year, p.awards.join('; ')])], 'De_Tai_Nghien_Cuu_Khoa_Hoc.xlsx'); }
    catch (e) { notify(e.message, 'error'); }
  });
  $('researchImport').addEventListener('click', () => { if (canCreate(state) && loaded) $('researchFile').click(); });
  $('researchFile').addEventListener('change', async event => {
    const file = event.target.files[0]; event.target.value = ''; if (!file || !canCreate(state)) return;
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('File tối đa 10 MB.');
      const XLSX = requireXLSX(), workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      if (!canCreate(state)) return;
      importing = parseResearchRows(XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: '' }), state, projects, () => crypto.randomUUID());
      $('researchImportSummary').textContent = `${importing.length} đề tài: ${importing.filter(x => !x.existing).length} thêm mới, ${importing.filter(x => x.existing).length} cập nhật. Kiểm tra trước khi xác nhận.`;
      setHTML($('researchImportRows'), importing.map((d, i) => `<tr><td>${i + 1}</td><td>${esc(d.project.title)}</td><td>${d.project.participants.length}</td><td>${esc(leaderClass(d.project, state.students))}</td><td data-import-status="${i}">Chờ xác nhận</td></tr>`).join(''));
      $('researchImportConfirm').disabled = false; $('researchImportResult').textContent = '';
      importDialog.showModal();
    } catch (e) { importing = []; notify(e.message, 'error'); }
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
    $('researchImportResult').textContent = `${success} thành công, ${failed} chưa xác nhận. ${failed ? 'Các đề tài thành công đã được lưu. Đóng và Tải lại để kiểm tra trước khi nhập lại; không gửi lại cả file.' : 'Đóng để xem danh sách.'}`;
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
