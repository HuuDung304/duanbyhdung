import { escapeHTML as esc, sanitizeHTML } from '../safe-html.js';
import { researchStudentCandidates } from './model.js';

export function createResearchPeoplePicker(root, { getStudents, initialIds = [], leaderId = '', single = false, disabled = false }) {
  const abort = new AbortController();
  let ids = [...new Set(initialIds)], leader = leaderId, candidates = [];
  root.innerHTML = sanitizeHTML(`<div class="research-person-entry"><input type="text" data-person-input placeholder="Nhập họ tên hoặc mã học viên" aria-label="Họ tên hoặc mã học viên" autocomplete="off" ${disabled ? 'disabled' : ''}><button type="button" data-person-add aria-label="Thêm học viên" ${disabled ? 'disabled' : ''}>+</button></div><p class="research-person-message" role="status" aria-live="polite"></p><div data-person-choices hidden></div><ul class="research-selected-people"></ul>`);
  const input = root.querySelector('[data-person-input]'), message = root.querySelector('[role="status"]'), choiceBox = root.querySelector('[data-person-choices]'), list = root.querySelector('ul');
  function render() {
    list.innerHTML = sanitizeHTML(ids.map(id => {
      const s = getStudents().find(s => s.id === id);
      return `<li><div><strong>${esc(s?.name || 'Học viên không còn trong danh sách')}</strong><small>${esc(s?.code || id)} · ${esc(s?.class || '—')}${id === leader ? ' · Chủ đề tài' : ''}</small></div><button type="button" data-person-remove="${esc(id)}" aria-label="Bỏ ${esc(s?.name || id)}" ${disabled || !single && id === leader ? 'disabled' : ''}>×</button></li>`;
    }).join(''));
  }
  function add(id) {
    if (single) ids = [id]; else if (!ids.includes(id)) ids.push(id);
    message.textContent = ''; choiceBox.hidden = true; candidates = []; input.value = ''; render(); input.focus();
  }
  function find() {
    if (disabled || !input.value.trim()) return;
    candidates = researchStudentCandidates(input.value, getStudents());
    choiceBox.hidden = true;
    if (!candidates.length) { message.textContent = 'Không tìm thấy học viên. Kiểm tra họ tên hoặc mã.'; return; }
    if (candidates.length === 1) { add(candidates[0].id); return; }
    message.textContent = 'Trùng tên. Chọn đúng mã học viên và lớp.';
    choiceBox.innerHTML = sanitizeHTML(`<select data-person-choice aria-label="Chọn học viên trùng tên"><option value="">Chọn học viên</option>${candidates.map(s => `<option value="${esc(s.id)}">${esc(s.name)} · ${esc(s.code)} · ${esc(s.class)}</option>`).join('')}</select><button type="button" data-person-confirm>Chọn</button>`); choiceBox.hidden = false;
  }
  root.addEventListener('click', event => {
    if (disabled) return;
    if (event.target.closest('[data-person-add]')) find();
    const remove = event.target.closest('[data-person-remove]');
    if (remove && (single || remove.dataset.personRemove !== leader)) { ids = ids.filter(id => id !== remove.dataset.personRemove); render(); }
    if (event.target.closest('[data-person-confirm]')) {
      const selected = choiceBox.querySelector('select').value;
      if (candidates.some(s => s.id === selected)) add(selected);
      else message.textContent = 'Chọn một học viên trước khi tiếp tục.';
    }
  }, { signal: abort.signal });
  input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); find(); } }, { signal: abort.signal });
  render();
  return { getIds: () => [...ids], setLeader(id) { leader = id; if (id && !ids.includes(id)) ids.push(id); render(); }, destroy() { abort.abort(); } };
}
