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

// Only inspect changed tables. Focus/hover classes must not rescan thousands of cells.
const observed = new WeakSet();
const preparedRows = new WeakSet();
const dirtyTables = new Set();
let pending = false;
function queueTables(tables = document.querySelectorAll('.u040-content table')) {
  for (const table of tables) dirtyTables.add(table);
  if (pending || !dirtyTables.size) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    const tables = [...dirtyTables];
    dirtyTables.clear();
    enhanceTables(tables);
  });
}
const resize = new ResizeObserver(entries => queueTables(entries.map(entry => entry.target)));
function enhanceTables(tables) {
  // Finish geometry reads before changing attributes/styles to avoid forced layout per column.
  const measurements = tables.filter(table => table.isConnected && table.getClientRects().length && table.tHead)
    .map(table => {
      const headers = [...(table.tHead.rows[0]?.cells || [])];
      if (headers.length < 3 || !/mã/i.test(headers[1].textContent) || !/tên/i.test(headers[2].textContent)) return null;
      return { table, headers, widths: headers.slice(0, 3).map(header => header.getBoundingClientRect().width) };
    }).filter(Boolean);
  for (const { table, headers, widths } of measurements) {
    const scroll = table.parentElement;
    if (!table.classList.contains('readable-data-table')) table.classList.add('readable-data-table');
    if (!scroll.classList.contains('readable-table-scroll')) scroll.classList.add('readable-table-scroll');
    if (scroll.tabIndex !== 0) scroll.tabIndex = 0;
    if (scroll.getAttribute('role') !== 'region') scroll.setAttribute('role', 'region');
    const label = 'Bảng dữ liệu, có thể cuộn để xem thêm cột';
    if (scroll.getAttribute('aria-label') !== label) scroll.setAttribute('aria-label', label);
    if (!observed.has(table)) { observed.add(table); resize.observe(table); }
    const offsets = [0, widths[0], widths[0] + widths[1]];
    const identityRows = [headers.slice(0, 3)];
    for (const body of table.tBodies) for (const row of body.rows) {
      if (!preparedRows.has(row)) {
        for (const cell of [...row.cells].slice(3)) {
          const numeric = Boolean(cell.querySelector('input')) || /^-?\d+(?:[.,]\d+)?$/.test(cell.textContent.trim());
          cell.toggleAttribute('data-numeric-cell', numeric && cell.colSpan === 1);
        }
        preparedRows.add(row);
      }
      if (row.cells.length > 3 && row.cells[0].colSpan === 1) identityRows.push([...row.cells].slice(0, 3));
    }
    for (const cells of identityRows) cells.forEach((cell, index) => {
      if (cell.dataset.identityColumn !== String(index)) cell.dataset.identityColumn = String(index);
      const left = `${offsets[index]}px`;
      if (cell.style.getPropertyValue('--identity-left') !== left) cell.style.setProperty('--identity-left', left);
    });
    const padding = `${(mobile.matches ? widths[2] : widths.reduce((sum, width) => sum + width, 0)) + 8}px`;
    if (scroll.style.scrollPaddingLeft !== padding) scroll.style.scrollPaddingLeft = padding;
  }
}
const content = document.querySelector('.u040-content');
if (content) new MutationObserver(records => {
  const changed = new Set();
  for (const record of records) {
    const element = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
    if (record.type === 'attributes') {
      // Class changes on inputs, rows and toolbars don't change column geometry.
      if (element.matches('.tab-content')) element.querySelectorAll('table').forEach(table => changed.add(table));
      continue;
    }
    const table = element.closest('table');
    if (table) {
      const row = element.closest('tr');
      if (row) preparedRows.delete(row);
      changed.add(table);
    }
    for (const node of record.addedNodes) if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.matches('table')) changed.add(node);
      node.querySelectorAll('table').forEach(table => changed.add(table));
    }
  }
  queueTables(changed);
}).observe(content, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class'] });
window.addEventListener('resize', () => queueTables());
queueTables();
