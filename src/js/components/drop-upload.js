// Lucian UX/UI Prompt #032 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#032
import { cancelImportRead } from './upload-state.js';
import { sanitizeHTML } from '../safe-html.js';
import { handleExcelFileUpload } from '../grades.js';
import { handleQuickImportFileUpload } from '../students.js';
const svg = markup => {
  const template = document.createElement('template'); template.innerHTML = sanitizeHTML(markup);
  return template.content;
};
const cloud = '<svg viewBox="0 0 28 28" aria-hidden="true"><path d="M8.5 20.5H7a5 5 0 01-.6-10 7 7 0 0113.4-1.6A5.5 5.5 0 0121 20.5h-1.5M14 13v10M10.5 16.5L14 13l3.5 3.5"/></svg>';
const check = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.4l3 3 6-6.4"/></svg>';
const sizes = bytes => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
for (const [zoneId,inputId,confirmId,reset,title] of [
  ['dropZone','excelFileInput','btnConfirmImport',handleExcelFileUpload,'bảng điểm'],
  ['quickImportDropZone','quickImportFileInput','btnExecuteQuickImport',handleQuickImportFileUpload,'hồ sơ quân nhân']
]) {
  const old = document.getElementById(zoneId), input = document.getElementById(inputId);
  if (!old || !input) continue;
  const root = document.createElement('div'); root.className = 'u032';
  const zone = document.createElement('button'); zone.type = 'button'; zone.className = 'u032-zone';
  zone.setAttribute('aria-label', `Chọn hoặc kéo thả file ${title} Excel`);
  zone.append(svg('<svg class="u032-dash" aria-hidden="true"><rect width="100%" height="100%" rx="25"/></svg>'));
  const orb = document.createElement('span'); orb.className = 'u032-orb'; orb.setAttribute('aria-hidden','true'); orb.append(svg(cloud));
  const heading = document.createElement('b'); heading.append('Kéo file vào đây hoặc ');
  const browse = document.createElement('em'); browse.textContent = 'chọn file'; heading.append(browse);
  const hint = document.createElement('small'); hint.textContent = '.xlsx, .xls, .csv · Một file mỗi lần'; hint.id = `${inputId}-hint`;
  zone.setAttribute('aria-describedby', hint.id); zone.append(orb,heading,hint);
  const list = document.createElement('ul'); list.className = 'u032-list';
  const announcement = document.createElement('p'); announcement.className = 'u032-announcement'; announcement.setAttribute('role','status');
  // Preserve IDs and the existing delegated click/change handlers on document.
  old.className = 'u032-target'; old.replaceChildren(zone,input); old.before(root); root.append(old,list,announcement);
  input.classList.add('u032-file'); input.tabIndex = -1; input.setAttribute('aria-label',`File ${title}`);
  let currentFile = null, row, meta, status, bar, retry, depth = 0;
  const busy = () => document.getElementById(confirmId)?.getAttribute('aria-busy') === 'true';
  function show(file, state, message) {
    if (!row || file !== currentFile) {
      list.replaceChildren(); currentFile = file;
      row = document.createElement('li'); row.className = 'u032-row';
      const icon = document.createElement('span'); icon.className = 'u032-ic'; icon.setAttribute('aria-hidden','true'); icon.textContent = file.name.split('.').pop().slice(0,4).toUpperCase();
      const info = document.createElement('span'); info.className = 'u032-meta';
      const name = document.createElement('b'); name.textContent = file.name; name.title = file.name;
      meta = document.createElement('small'); info.append(name,meta);
      status = document.createElement('span'); status.className = 'u032-st'; status.setAttribute('aria-hidden','true');
      retry = document.createElement('button'); retry.type = 'button'; retry.className = 'u032-retry'; retry.textContent = 'Thử lại'; retry.hidden = true;
      retry.addEventListener('click', () => { if (busy()) return; const data = new DataTransfer(); data.items.add(currentFile); input.files = data.files; input.dispatchEvent(new Event('change',{bubbles:true})); });
      bar = document.createElement('span'); bar.className = 'u032-bar'; bar.setAttribute('role','progressbar'); bar.setAttribute('aria-label','Tiến độ đọc file'); bar.setAttribute('aria-valuemin','0'); bar.setAttribute('aria-valuemax','100');
      row.append(icon,info,status,retry,bar); list.append(row);
    }
    row.className = `u032-row ${state === 'ready' ? 'done' : state === 'failed' ? 'fail' : ''}`;
    meta.textContent = message; status.replaceChildren(); retry.hidden = state !== 'failed';
    if (state === 'ready') status.append(svg(check));
    if (state === 'reading') { const spinner = document.createElement('span'); spinner.className = 'u032-spin'; status.append(spinner); }
    announcement.textContent = state === 'reading' ? `Đang đọc ${file.name}` : `${file.name}: ${message}`;
  }
  input.addEventListener('import-file-state', event => {
    const {file,state,progress,message} = event.detail;
    if (file !== currentFile) return;
    show(file,state,message || `${sizes(file.size)} · Đang đọc và kiểm tra…`);
    row.style.setProperty('--p',String(progress));
    bar.setAttribute('aria-valuenow',String(Math.round(progress * 100)));
  });
  input.addEventListener('change', event => {
    if (busy()) { event.stopImmediatePropagation(); announcement.textContent = 'Đang lưu dữ liệu. Vui lòng chờ hoàn tất.'; return; }
    cancelImportRead(inputId);
    const file = input.files?.[0];
    if (!file) { reset(null); list.replaceChildren(); currentFile = null; row = null; announcement.textContent = ''; return; }
    show(file,'reading',`${sizes(file.size)} · Đang đọc và kiểm tra…`);
    if (input.files.length !== 1 || !/\.(xlsx|xls|csv)$/i.test(file.name) || file.size === 0) {
      event.stopImmediatePropagation(); reset(null); input.value = '';
      show(file,'failed','Chọn một file .xlsx, .xls hoặc .csv có dữ liệu.');
    }
  },true);
  zone.addEventListener('dragenter', event => { event.preventDefault(); if (!busy()) { depth++; root.classList.add('is-over'); } });
  zone.addEventListener('dragover', event => { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = busy() ? 'none' : 'copy'; });
  zone.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; root.classList.remove('is-over'); } });
  zone.addEventListener('drop', event => {
    event.preventDefault(); depth = 0; root.classList.remove('is-over');
    if (busy()) return;
    const files = event.dataTransfer?.files; if (!files?.length) return;
    if (files.length !== 1) { announcement.textContent = 'Chỉ nhận một file mỗi lần. Dữ liệu xem trước trước đó vẫn được giữ.'; return; }
    const data = new DataTransfer(); data.items.add(files[0]); input.files = data.files;
    input.dispatchEvent(new Event('change',{bubbles:true}));
  });
  const confirm = document.getElementById(confirmId);
  if (confirm) new MutationObserver(() => { zone.disabled = busy(); input.disabled = busy(); retry && (retry.disabled = busy()); }).observe(confirm,{attributes:true,attributeFilter:['aria-busy']});
}
