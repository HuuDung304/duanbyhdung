import { sanitizeHTML } from '../safe-html.js';

// Presentation-only layer: Focus Mode, Table/Card switcher, sticky scroll shadows, active row highlight.
// Preserves all existing IDs, delegated events, form values, and business logic.

const FOCUS_KEY = 'dd460_focus_mode';
const TABLE_VIEW_KEY = 'dd460_table_view';

const root = document.documentElement;
const content = document.querySelector('.u040-content');
const toolbarActions = document.querySelector('#interfaceToolbar .ui-toolbar-actions');
const themeButton = document.getElementById('interfaceThemeButton');

function readStorage(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Preference still applies for the active session without storage access.
  }
}

/* ==========================================================================
   1. FOCUS MODE & TABLE/CARD VIEW STATE
   ========================================================================== */
function setFocusMode(enabled, persist = true) {
  const on = Boolean(enabled);
  root.dataset.focusMode = on ? 'on' : 'off';
  if (persist) writeStorage(FOCUS_KEY, on ? 'on' : 'off');
  syncControls();
  requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
}

function setTableView(mode, persist = true) {
  const next = mode === 'cards' ? 'cards' : 'table';
  root.dataset.tableView = next;
  if (persist) writeStorage(TABLE_VIEW_KEY, next);
  if (next === 'cards') queueTablePreparation();
  syncControls();
  requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
}

let focusButton = null;
let tableBtn = null;
let cardBtn = null;
let settingsFocusSwitch = null;

function syncControls() {
  const focusOn = root.dataset.focusMode === 'on';
  const viewMode = root.dataset.tableView === 'cards' ? 'cards' : 'table';

  if (focusButton) {
    focusButton.setAttribute('aria-pressed', String(focusOn));
    focusButton.title = focusOn ? 'Thoát chế độ tập trung (Alt+F)' : 'Chế độ tập trung mở rộng bảng (Alt+F)';
    const label = focusButton.querySelector('span');
    if (label) label.textContent = focusOn ? 'Thoát tập trung' : 'Tập trung';
    const enterIcon = focusButton.querySelector('.ui-focus-enter');
    const exitIcon = focusButton.querySelector('.ui-focus-exit');
    if (enterIcon) enterIcon.style.display = focusOn ? 'none' : 'block';
    if (exitIcon) exitIcon.style.display = focusOn ? 'block' : 'none';
  }

  if (tableBtn && cardBtn) {
    tableBtn.setAttribute('aria-pressed', String(viewMode === 'table'));
    cardBtn.setAttribute('aria-pressed', String(viewMode === 'cards'));
  }

  if (settingsFocusSwitch) {
    settingsFocusSwitch.setAttribute('aria-checked', String(focusOn));
    const state = settingsFocusSwitch.querySelector('.display-settings-state');
    if (state) state.textContent = focusOn ? 'Bật' : 'Tắt';
  }
}

/* ==========================================================================
   2. TOOLBAR CONTROLS (VIEW SWITCHER + FOCUS MODE PILL)
   ========================================================================== */
if (toolbarActions && !document.getElementById('interfaceFocusButton')) {
  const switcher = document.createElement('div');
  switcher.id = 'interfaceViewSwitcher';
  switcher.className = 'ui-view-switcher';
  switcher.setAttribute('role', 'group');
  switcher.setAttribute('aria-label', 'Chế độ hiển thị bảng dữ liệu');

  tableBtn = document.createElement('button');
  tableBtn.type = 'button';
  tableBtn.title = 'Xem dạng bảng';
  tableBtn.setAttribute('aria-label', 'Xem dạng bảng');
  tableBtn.innerHTML = sanitizeHTML(
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">' +
    '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 10h18M9 10v10"/></svg><span>Bảng</span>'
  );
  tableBtn.addEventListener('click', () => setTableView('table'));

  cardBtn = document.createElement('button');
  cardBtn.type = 'button';
  cardBtn.title = 'Xem dạng thẻ (tiện lợi trên màn hình nhỏ)';
  cardBtn.setAttribute('aria-label', 'Xem dạng thẻ');
  cardBtn.innerHTML = sanitizeHTML(
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">' +
    '<rect x="3" y="4" width="8" height="7" rx="2"/><rect x="13" y="4" width="8" height="7" rx="2"/>' +
    '<rect x="3" y="13" width="8" height="7" rx="2"/><rect x="13" y="13" width="8" height="7" rx="2"/></svg><span>Thẻ</span>'
  );
  cardBtn.addEventListener('click', () => setTableView('cards'));

  switcher.append(tableBtn, cardBtn);

  focusButton = document.createElement('button');
  focusButton.type = 'button';
  focusButton.id = 'interfaceFocusButton';
  focusButton.className = 'ui-focus-pill';
  focusButton.innerHTML = sanitizeHTML(
    '<svg class="ui-focus-enter" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">' +
    '<path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
    '<svg class="ui-focus-exit" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true" style="display:none">' +
    '<path d="M9 4v4a1 1 0 0 1-1 1H4M15 4v4a1 1 0 0 0 1 1h4M9 20v-4a1 1 0 0 0-1-1H4M15 20v-4a1 1 0 0 1 1-1h4" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
    '<span>Tập trung</span>'
  );
  focusButton.addEventListener('click', () => setFocusMode(root.dataset.focusMode !== 'on'));

  if (themeButton && themeButton.parentElement === toolbarActions) {
    toolbarActions.insertBefore(switcher, themeButton);
    toolbarActions.insertBefore(focusButton, themeButton);
  } else {
    toolbarActions.append(switcher, focusButton);
  }
}

/* ==========================================================================
   3. MOUNT FOCUS MODE SWITCH IN DISPLAY SETTINGS CARD (WHEN AVAILABLE)
   ========================================================================== */
function tryMountSettingsRow() {
  const card = document.querySelector('.workspace-settings-card.display-settings');
  if (!card || document.getElementById('focusModeSettingsToggle')) return;

  const row = document.createElement('div');
  row.className = 'display-settings-row';

  const label = document.createElement('div');
  const title = document.createElement('strong');
  title.id = 'focusModeLabel';
  title.textContent = 'Chế độ tập trung';
  const note = document.createElement('p');
  note.id = 'focusModeHelp';
  note.textContent = 'Ẩn thanh điều hướng để mở rộng tối đa bảng điểm và danh sách (phím tắt Alt+F).';
  label.append(title, note);

  const btn = document.createElement('button');
  btn.id = 'focusModeSettingsToggle';
  btn.type = 'button';
  btn.className = 'display-settings-switch';
  btn.setAttribute('role', 'switch');
  btn.setAttribute('aria-labelledby', title.id);
  btn.setAttribute('aria-describedby', note.id);

  const state = document.createElement('span');
  state.className = 'display-settings-state';
  const track = document.createElement('span');
  track.className = 'display-settings-track';
  track.setAttribute('aria-hidden', 'true');
  track.append(document.createElement('span'));
  btn.append(state, track);

  btn.addEventListener('click', () => setFocusMode(root.dataset.focusMode !== 'on'));
  row.append(label, btn);
  card.append(row);

  settingsFocusSwitch = btn;
  syncControls();
}

/* ==========================================================================
   4. STICKY SCROLL SHADOWS, ACTIVE ROW HIGHLIGHT & CARD-VIEW LABELS
   ========================================================================== */
const watchedScrolls = new WeakSet();

function syncScrollShadows(container) {
  if (!container) return;
  const sx = container.scrollLeft > 4;
  const sy = container.scrollTop > 4;
  if (sx) container.dataset.scrolledX = 'true';
  else delete container.dataset.scrolledX;
  if (sy) container.dataset.scrolledY = 'true';
  else delete container.dataset.scrolledY;
}

function attachScrollWatchers() {
  if (!content) return;
  const containers = content.querySelectorAll(
    '.readable-table-scroll, .workspace-table-scroll, .research-scroll, .catalog-table-scroll'
  );
  for (const el of containers) {
    if (watchedScrolls.has(el)) continue;
    watchedScrolls.add(el);
    let ticking = false;
    el.addEventListener(
      'scroll',
      () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          ticking = false;
          syncScrollShadows(el);
        });
      },
      { passive: true }
    );
    syncScrollShadows(el);
  }
}

function getHeaderLabels(table) {
  const thead = table.tHead;
  if (!thead || !thead.rows.length) return [];
  // Prefer the last header row if multi-row header is simple; otherwise use first row text.
  const primaryRow = thead.rows[0];
  const labels = [];
  for (const cell of primaryRow.cells) {
    const text = cell.textContent.replace(/\s+/g, ' ').trim();
    const span = Math.max(1, cell.colSpan || 1);
    for (let i = 0; i < span; i++) labels.push(text);
  }
  return labels;
}

function prepareTablesForCards() {
  if (!content) return;
  const tables = content.querySelectorAll('table');
  for (const table of tables) {
    if (table.id === 'yearBreakdownTable') continue;
    const labels = getHeaderLabels(table);
    if (labels.length < 3) continue;
    table.classList.add('ui-cardable-table');

    for (const tbody of table.tBodies) {
      for (const row of tbody.rows) {
        if (row.cells.length === 1 && row.cells[0].colSpan > 1) continue;
        let colIndex = 0;
        for (const cell of row.cells) {
          const label = labels[colIndex] || '';
          if (cell.dataset.colLabel !== label) cell.dataset.colLabel = label;
          colIndex += Math.max(1, cell.colSpan || 1);
        }
      }
    }
  }
}

let tablePrepQueued = false;
function queueTablePreparation() {
  if (tablePrepQueued) return;
  tablePrepQueued = true;
  requestAnimationFrame(() => {
    tablePrepQueued = false;
    attachScrollWatchers();
    prepareTablesForCards();
    tryMountSettingsRow();
  });
}

// Active row highlight via lightweight event delegation
if (content) {
  let activeRow = null;
  const setActiveRow = (row) => {
    if (activeRow === row) return;
    if (activeRow) activeRow.classList.remove('ui-row-active');
    activeRow = row;
    if (activeRow) activeRow.classList.add('ui-row-active');
  };

  content.addEventListener('click', (event) => {
    const row = event.target.closest?.('table tbody tr');
    if (row && !(row.cells.length === 1 && row.cells[0].colSpan > 1)) {
      setActiveRow(row);
    }
  });

  content.addEventListener('focusin', (event) => {
    const row = event.target.closest?.('table tbody tr');
    if (row) setActiveRow(row);
  });

  new MutationObserver(() => queueTablePreparation()).observe(content, {
    childList: true,
    subtree: true,
  });
}

// Keyboard shortcut: Alt+F toggles Focus Mode
document.addEventListener('keydown', (event) => {
  if (event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'f') {
    if (document.querySelector('dialog[open]')) return;
    event.preventDefault();
    setFocusMode(root.dataset.focusMode !== 'on');
  }
});

// Sync preferences across tabs
window.addEventListener('storage', (event) => {
  if (event.key === FOCUS_KEY) setFocusMode(event.newValue === 'on', false);
  if (event.key === TABLE_VIEW_KEY) setTableView(event.newValue, false);
});

// Initialize persisted state
setFocusMode(readStorage(FOCUS_KEY, 'off') === 'on', false);
setTableView(readStorage(TABLE_VIEW_KEY, 'table'), false);
queueTablePreparation();
