import './bento-dashboard.js';
// Presentation only: preserve existing controls, values, delegated events and application state.
const mobile = matchMedia('(max-width: 640px)');
function disclosure(id, label) {
  const details = document.createElement('details');
  details.id = id;
  const summary = document.createElement('summary');
  summary.textContent = label;
  details.append(summary);
  return details;
}
const toolbar = document.querySelector('.bento-toolbar');
if (toolbar) {
  const tools = disclosure('toolbarOptions', 'Tùy chọn');
  const body = document.createElement('div'); body.className = 'toolbar-options-body';
  for (const child of [...toolbar.children]) if (!child.classList.contains('bento-search-wrap')) body.append(child);
  tools.append(body); toolbar.append(tools);
}
const filters = document.querySelector('.sheet-filter-controls');
if (filters) {
  const advanced = disclosure('sheetAdvancedControls', 'Tùy chọn bảng điểm');
  const body = document.createElement('div'); body.className = 'sheet-advanced-body';
  const scale = document.getElementById('btnSheetScale10')?.parentElement.parentElement;
  if (scale) body.append(scale);
  const lock = document.getElementById('sheetLockBox'); if (lock) body.append(lock);
  advanced.append(body); filters.append(advanced);
}
function responsiveDisclosures() {
  for (const id of ['toolbarOptions','sheetAdvancedControls']) {
    const element = document.getElementById(id); if (element) element.open = !mobile.matches;
  }
}
responsiveDisclosures(); mobile.addEventListener('change', responsiveDisclosures);
document.addEventListener('keydown', event => {
  const options = document.getElementById('toolbarOptions');
  if (event.key === 'Escape' && mobile.matches && options?.open) { options.open = false; options.querySelector('summary').focus(); }
});
document.addEventListener('click', event => {
  const options = document.getElementById('toolbarOptions');
  if (mobile.matches && options?.open && !options.contains(event.target)) options.open = false;
});

// Measure actual identity-column widths; no hardcoded offsets or table re-rendering.
const observed = new WeakSet();
let pending = false;
function queueTables() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => { pending = false; enhanceTables(); });
}
const resize = new ResizeObserver(queueTables);
function enhanceTables() {
  for (const section of document.querySelectorAll('.u040-content .tab-content')) {
    for (const table of section.querySelectorAll('table')) {
      if (!table.getClientRects().length || !table.tHead) continue;
      const headers = [...(table.tHead.rows[0]?.cells || [])];
      if (headers.length < 3 || !/mã/i.test(headers[1].textContent) || !/tên/i.test(headers[2].textContent)) continue;
      if (!table.classList.contains('readable-data-table')) table.classList.add('readable-data-table');
      const scroll = table.parentElement;
      if (!scroll.classList.contains('readable-table-scroll')) scroll.classList.add('readable-table-scroll');
      scroll.tabIndex = 0;
      scroll.setAttribute('role','region');
      scroll.setAttribute('aria-label','Bảng dữ liệu, có thể cuộn để xem thêm cột');
      if (!observed.has(table)) { observed.add(table); resize.observe(table); }
      for (const body of table.tBodies) for (const row of body.rows) {
        for (const cell of [...row.cells].slice(3)) {
          const input = cell.querySelector('input');
          const numeric = Boolean(input) || /^-?\d+(?:[.,]\d+)?$/.test(cell.textContent.trim());
          cell.toggleAttribute('data-numeric-cell', numeric && cell.colSpan === 1);
        }
      }
      let offset = 0;
      headers.slice(0,3).forEach((header,index) => {
        for (const cell of [header,...[...table.tBodies].flatMap(body=>[...body.rows].filter(row=>row.cells.length>3 && row.cells[0].colSpan===1).map(row=>row.cells[index]))]) {
          cell.dataset.identityColumn = String(index);
          cell.style.setProperty('--identity-left', `${offset}px`);
        }
        offset += header.getBoundingClientRect().width;
      });
      scroll.style.scrollPaddingLeft = `${(mobile.matches ? headers[2].getBoundingClientRect().width : offset) + 8}px`;
    }
  }
}
const content = document.querySelector('.u040-content');
if (content) new MutationObserver(queueTables).observe(content,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','class']});
window.addEventListener('resize',queueTables); queueTables();
