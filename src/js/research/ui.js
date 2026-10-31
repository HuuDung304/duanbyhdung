import { mountResearchDetail } from './detail.js';
import { createResearchPeoplePicker } from './people-picker.js';
import { escapeHTML as esc, sanitizeHTML } from '../safe-html.js';
import { AWARDS, actor, participants, leaderClass, canView, canEdit, canAward, canCreate, scopedProjects, researchStats, latestYearGPA, EXCEL_HEADERS, EXPORT_HEADERS, normalizeAwards, parseResearchRows, researchStudentCandidates, studentNameKey, ResearchStudentChoiceError } from './model.js';
import { createResearchStore } from './store.js';

export function formatResearchInformation(value) {
  const labels = { 'mục tiêu': 'Mục tiêu:', 'nội dung': 'Nội dung nghiên cứu:', 'nội dung nghiên cứu': 'Nội dung nghiên cứu:', 'sản phẩm': 'Sản phẩm dự kiến:', 'sản phẩm dự kiến': 'Sản phẩm dự kiến:', 'sản phẩm dự kiển': 'Sản phẩm dự kiến:' };
  return esc(value).replace(/(^|\s)(Mục tiêu|Nội dung nghiên cứu|Nội dung|Sản phẩm dự kiến|Sản phẩm dự kiển|Sản phẩm)\s*:/giu,
    (_, prefix, label) => prefix + '<strong>' + labels[label.toLocaleLowerCase('vi')] + '</strong>');
}

export function mountResearch({ state, classes, subjectsForClass, notify }) {
  const $ = id => document.getElementById(id);
  const root = $('tab-research'), editor = $('researchEditor'), importDialog = $('researchImportDialog'), uploadDialog = $('researchUploadDialog'), exportDialog = $('researchExportDialog'), resolveDialog = $('researchResolveDialog');
  if (!root || root.dataset.mounted) return;
  root.dataset.mounted = 'true';
  const store = createResearchStore(() => state);
  let projects = [], loaded = false, loading = false, error = '', filter = 'all', editing = null, draftId = '', importing = [], busy = false, identity = '', generation = 0, pendingImport = null, memberPicker = null;
  const identityKey = () => JSON.stringify([state.role, state.currentUser?.studentId, state.currentUser?.code]);
  const setHTML = (element, html) => { element.innerHTML = sanitizeHTML(html); };
  const detail = mountResearchDetail({state,getProjects:()=>projects,formatInformation:formatResearchInformation,latestScore:student=>latestYearGPA(student,state,subjectsForClass(student.class)),onSaved:()=>render(),save:async(input,existing)=>{const key=identityKey();const saved=await store.save(input,existing);if(key!==identityKey())throw new Error('Tài khoản đã thay đổi.');replaceProject(saved);return saved;}});
  const button = (label, action, id) => `<button type="button" class="research-btn" data-research-action="${action}" data-project-id="${esc(id)}">${label}</button>`;
  const studentLine = (student, project) => `<div class="research-person"><button type="button" class="btn-view-cadet-detail research-student-link" data-id="${esc(student.studentId)}">${esc(student.name || student.code)}</button>${student.studentId === project.leaderId ? ' <span class="research-owner">Chủ đề tài</span>' : ''}</div>`;
  const blankGuides = (project, values) => project.advisors?.length ? `<div class="research-guide-label" aria-hidden="true">&nbsp;</div>${project.advisors.map((a, i) => `<div class="research-person">${esc(values(a, i))}</div>`).join('')}` : '';
  function render() {
    const key = identityKey();
    if (key !== identity) {
      identity = key; filter = 'all'; generation++; projects = []; loaded = false; error = ''; loading = false;
      pendingImport = null; detail.reset(); memberPicker?.destroy();
      if (resolveDialog.open) resolveDialog.close();
      if (editor.open) editor.close();
      if (importDialog.open) importDialog.close();
      if (uploadDialog.open) uploadDialog.close();
      if (exportDialog.open) exportDialog.close();
      importing = [];
    }
    if (editor.open || importDialog.open || uploadDialog.open || resolveDialog.open || $('researchFieldDialog').open) return;
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
    $('researchStatus').title = 'Điểm trung bình của năm học mới nhất có điểm của từng học viên; học viên được đếm không trùng.';
    $('researchStatus').setAttribute('role', error ? 'alert' : 'status');
    if (error) { const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'research-btn'; retry.dataset.researchRetry = 'true'; retry.textContent = 'Thử lại'; $('researchStatus').append(' ', retry); }
    setHTML($('researchTableBody'), !loaded ? '<tr><td colspan="9" class="research-empty">Chưa tải được danh sách đề tài.</td></tr>' : !visible.length ? '<tr><td colspan="9" class="research-empty">Chưa có đề tài trong phạm vi này.</td></tr>' : visible.map((project, i) => {
      const people = participants(project, state.students);
      const gpas = people.map(p => latestYearGPA(p, state, subjectsForClass(p.class)));
      const awards = `<div class="research-award-list">${AWARDS.map(a => `<label class="research-award-check"><input type="checkbox" data-research-award="${esc(a)}" data-project-id="${esc(project.id)}" aria-label="${esc(a + ': ' + project.title)}" ${normalizeAwards(project.awards || []).includes(a) ? 'checked' : ''} ${canAward(project, state) ? '' : 'disabled'}><span>${esc(a)}</span></label>`).join('')}</div>`;
      return `<tr><td>${i + 1}</td><td class="research-topic">${button(esc(project.title), 'open', project.id)}<small>${esc(leaderClass(project, state.students))}</small></td><td class="research-description">${project.information ? `<p>${formatResearchInformation(project.information)}</p>` : ''}${[['Mục tiêu', project.objective], ['Nội dung nghiên cứu', project.content], ['Sản phẩm dự kiến', project.product]].filter(([, value]) => value).map(([label, value]) => `<b>${label}:</b><p>${esc(value)}</p>`).join('') || (project.information ? '' : 'Chưa cập nhật')}</td><td class="research-people"><b class="research-guide-label">Học viên thực hiện:</b>${people.map(p => studentLine(p, project)).join('')}${project.advisors?.length ? '<b class="research-guide-label">Cán bộ hướng dẫn:</b>' + project.advisors.map(a => `<div class="research-person">${esc(a.name)}</div>`).join('') : ''}</td><td><div class="research-guide-label" aria-hidden="true">&nbsp;</div>${people.map(p => `<div class="research-person">${esc(p.class || '—')}/c460/d4</div>`).join('')}${blankGuides(project, a => a.unit || '—')}</td><td><div class="research-guide-label" aria-hidden="true">&nbsp;</div>${gpas.map(({year,gpa}) => `<div class="research-person" title="${year ? 'Điểm trung bình năm học ' + year : 'Chưa có điểm'}">${gpa === null ? '—' : gpa.toFixed(2).replace('.', ',')}${year ? `<small class="research-score-year">Năm ${year}</small>` : ''}</div>`).join('')}${blankGuides(project, () => '—')}</td><td><div class="research-guide-label" aria-hidden="true">&nbsp;</div>${people.map(p => `<div class="research-person">${esc(p.code || '—')}</div>`).join('')}${blankGuides(project, () => '—')}</td><td>${awards}</td><td class="research-notes"><div>${esc(project.notes || '—')}</div></td></tr>`;
    }).join(''));
    detail.render();
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
    $('researchForm').reset(); $('researchLeaderMatches').textContent = ''; $('researchFormError').textContent = '';
    $('researchInfoFields').disabled = !infoAllowed;
    const leader = project?.leaderId || (state.role === 'student' ? actor(state).studentId : '');
    setHTML($('researchLeader'), '<option value="">Chọn chủ đề tài</option>' + options(leader, true));
    // An award-only class account must still see the owner from another class.
    if (leader && !$('researchLeader').value) setHTML($('researchLeader'), options(leader));
    $('researchTitle').value = project?.title || '';
    $('researchYear').value = project?.year || '1';
    $('researchObjective').value = project?.objective || '';
    $('researchInformation').value = project?.information || '';
    $('researchContent').value = project?.content || '';
    $('researchNotes').value = project?.notes || '';
    $('researchProduct').value = project?.product || '';
    $('researchAdvisors').value = (project?.advisors || []).map(a => a.name + (a.unit ? ' | ' + a.unit : '')).join('\n');
    memberPicker?.destroy();
    memberPicker = createResearchPeoplePicker($('researchMembers'),{getStudents:()=>state.students,initialIds:project?.participants.map(p=>p.studentId) || (leader?[leader]:[]),leaderId:leader,disabled:!infoAllowed});
    setHTML($('researchAwards'), AWARDS.map(a => `<label><input type="checkbox" name="researchAward" value="${esc(a)}" ${normalizeAwards(project?.awards || []).includes(a) ? 'checked' : ''}>${esc(a)}</label>`).join(''));
    $('researchAwardFields').disabled = project ? !canAward(project, state) : state.role === 'student';
    $('researchAwardNote').textContent = $('researchAwardFields').disabled ? 'Chỉ Admin và tài khoản lớp được cập nhật giải thưởng.' : 'Tích chọn các mục giải thưởng.';
    editor.showModal(); $('researchTitle').focus();
  }
  function formInput() {
    return { id: draftId, title: $('researchTitle').value, year: $('researchYear').value,
      information: $('researchInformation').value, notes: $('researchNotes').value, objective: $('researchObjective').value, content: $('researchContent').value, product: $('researchProduct').value,
      leaderId: $('researchLeader').value, memberIds: memberPicker?.getIds() || [],
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
  $('researchLeaderSearch').addEventListener('input', event => {
    const value = event.target.value, term = studentNameKey(value), select = $('researchLeader');
    for (const option of select.options) option.hidden = !!option.value && !studentNameKey(option.textContent).includes(term);
    const matches = researchStudentCandidates(value, state.students);
    if (matches.length === 1 && [...select.options].some(option => option.value === matches[0].id)) {
      select.value = matches[0].id; select.dispatchEvent(new Event('change'));
      $('researchLeaderMatches').textContent = `${matches[0].code} · ${matches[0].class}`;
    } else {
      if (term) select.value = '';
      $('researchLeaderMatches').textContent = matches.length > 1 ? 'Trùng tên. Chọn đúng mã học viên và lớp trong danh sách.' : '';
    }
  });
  $('researchLeader').addEventListener('change', () => {
    memberPicker?.setLeader($('researchLeader').value);
    const chosen = state.students.find(s => s.id === $('researchLeader').value);
    $('researchLeaderMatches').textContent = chosen ? `${chosen.code} · ${chosen.class}` : '';
  });
  editor.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  importDialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  uploadDialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  function cancelStudentResolution() {
    const sameUser = pendingImport?.user === identityKey(); pendingImport = null; importing = [];
    resolveDialog.close();
    if (sameUser && canCreate(state)) uploadDialog.showModal();
  }
  resolveDialog.addEventListener('cancel', event => { event.preventDefault(); if (!busy) cancelStudentResolution(); });
  document.querySelectorAll('[data-research-close]').forEach(btn => btn.addEventListener('click', () => {
    if (busy) return;
    const dialog = btn.closest('dialog');
    if (dialog === resolveDialog) cancelStudentResolution(); else dialog.close();
  }));
  root.addEventListener('click', event => {
    if (event.target.closest('[data-research-retry]')) { reload(); return; }
    const tab = event.target.closest('[data-research-class]');
    if (tab) { filter = tab.dataset.researchClass; render(); }
    const action = event.target.closest('[data-research-action]');
    if (action?.dataset.researchAction === 'open') detail.open(projects.find(p => p.id === action.dataset.projectId));
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
    sheet['!cols'] = rows[0].map((header, i) => ({ wch: i === 0 ? 8 : i === 1 ? 28 : i === 3 ? 60 : 42, hidden: header === 'ID bản ghi' }));
    const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, 'Nghien_Cuu_Khoa_Hoc'); XLSX.writeFile(book, filename);
  }
  $('researchTemplate').addEventListener('click', () => {
    try { writeWorkbook([EXCEL_HEADERS, [1, '', 'Ví dụ: Nâng cao kỹ năng đọc hiểu tiếng Nga', 'Mục tiêu: Cải thiện kỹ năng đọc hiểu.\nNội dung nghiên cứu: Khảo sát và xây dựng phương pháp tự học.\nSản phẩm dự kiến: Báo cáo tổng kết đề tài.', 'HỌ_TÊN_HỌC_VIÊN_01', 'HỌ_TÊN_HỌC_VIÊN_01; MA_HV_02', 'Nguyễn Văn A | K13; Trần Thị B | K13']], 'Mau_Nghien_Cuu_Khoa_Hoc.xlsx'); notify('Đã tải mẫu có ví dụ. Thay dòng ví dụ bằng dữ liệu thật; có thể dùng mã hoặc họ tên học viên.', 'info'); }
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
      writeWorkbook([EXPORT_HEADERS, ...visible.map((p, i) => [i + 1, p.projectCode || '', p.title, p.information || '', participants(p, state.students).find(s => s.studentId === p.leaderId)?.code || '', participants(p, state.students).map(s => s.code).join('; '), p.advisors.map(a => a.name + ' | ' + a.unit).join('; '), p.objective, p.content, p.product, p.year, normalizeAwards(p.awards).join('; '), p.notes || '', p.id])], 'De_Tai_Nghien_Cuu_Khoa_Hoc.xlsx');
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
  function stageImport() {
    if (!pendingImport || pendingImport.user !== identityKey() || !canCreate(state)) return;
    try {
      importing = parseResearchRows(pendingImport.rows, state, projects, () => crypto.randomUUID(), pendingImport.selections);
      pendingImport = null;
      $('researchImportSummary').textContent = `${importing.length} đề tài: ${importing.filter(x => !x.existing).length} thêm mới, ${importing.filter(x => x.existing).length} cập nhật. Kiểm tra trước khi xác nhận.`;
      setHTML($('researchImportRows'), importing.map((d, i) => `<tr><td>${i + 1}</td><td>${esc(d.project.title)}</td><td>${d.project.participants.length}</td><td>${esc(leaderClass(d.project, state.students))}</td><td data-import-status="${i}">Chờ xác nhận</td></tr>`).join(''));
      $('researchImportConfirm').disabled = false; $('researchImportResult').textContent = '';
      uploadDialog.close(); resolveDialog.close(); importDialog.showModal();
    } catch (error) {
      if (!(error instanceof ResearchStudentChoiceError)) throw error;
      importing = [];
      setHTML($('researchResolveChoices'), error.choices.map(choice => `<label>Dòng ${choice.rowNumber} · ${esc(choice.label)}: <strong>${esc(choice.value)}</strong><select required data-research-resolution="${esc(choice.key)}"><option value="">Chọn học viên</option>${choice.candidates.map(s => `<option value="${esc(s.id)}">${esc(s.name)} · ${esc(s.code)} · ${esc(s.class)}</option>`).join('')}</select></label>`).join(''));
      uploadDialog.close();
      if (!resolveDialog.open) resolveDialog.showModal();
    }
  }
  $('researchResolveForm').addEventListener('submit', event => {
    event.preventDefault();
    if (!pendingImport || busy || pendingImport.user !== identityKey() || !canCreate(state)) return;
    for (const select of $('researchResolveChoices').querySelectorAll('select')) pendingImport.selections[select.dataset.researchResolution] = select.value;
    try { stageImport(); }
    catch (error) {
      pendingImport = null; importing = []; resolveDialog.close();
      $('researchUploadStatus').textContent = error.message; uploadDialog.showModal();
    }
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
      pendingImport = { rows: XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: '' }), selections: {}, user };
      stageImport();
    } catch (e) { pendingImport = null; importing = []; $('researchUploadStatus').textContent = e.message; notify(e.message, 'error'); }
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
    if (state.activeTab !== 'tab-research') detail.reset();
    render();
    if (state.activeTab === 'tab-research') reload();
  });
  return { render: () => { render(); if (state.activeTab === 'tab-research' && !loaded && !loading && !error) reload(); } };
}
