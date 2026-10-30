import './workspace-reports.js';
import { AppState, registerExternalHooks } from '../grades.js';
import { sanitizeHTML } from '../safe-html.js';

// Presentation only. Existing form nodes, IDs, delegated handlers and role checks are retained.
const shell = document.querySelector('.bento-shell');
const main = shell?.querySelector('.u040-main');
const nav = shell?.querySelector('.u040-rail');
if (shell && main && nav && !document.getElementById('interfaceToolbar')) {
  document.body.classList.add('ui-modern');
  const mobile = matchMedia('(max-width: 760px)');
  const toolbar = document.createElement('div'); toolbar.id = 'interfaceToolbar'; toolbar.className = 'ui-toolbar';
  const start = document.createElement('div'); start.className = 'ui-toolbar-start';
  const toggle = nav.querySelector('.u040-tog');
  toggle.id = 'interfaceMenuButton'; toggle.classList.add('ui-icon-button');
  toggle.innerHTML = sanitizeHTML('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 7h16M4 12h11M4 17h16" stroke-linecap="round"/></svg>');
  const title = document.createElement('h1'); title.id = 'interfacePageTitle';
  start.append(toggle, title);
  const actions = document.createElement('div'); actions.className = 'ui-toolbar-actions';
  const searchWrap = document.querySelector('.bento-search-wrap');
  const searchButton = document.createElement('button'); searchButton.type = 'button'; searchButton.className = 'ui-icon-button ui-search-toggle'; searchButton.setAttribute('aria-label', 'Tìm kiếm'); searchButton.setAttribute('aria-controls', 'interfaceSearch'); searchButton.setAttribute('aria-expanded', 'false');
  searchButton.innerHTML = sanitizeHTML('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4" stroke-linecap="round"/></svg>');
  if (searchWrap) { searchWrap.id = 'interfaceSearch'; searchWrap.classList.add('ui-search'); actions.append(searchButton, searchWrap); }
  const theme = document.createElement('button'); theme.type = 'button'; theme.id = 'interfaceThemeButton'; theme.className = 'ui-icon-button';
  theme.innerHTML = sanitizeHTML('<svg class="ui-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M20.7 13.2A8.9 8.9 0 0 1 10.8 3.3a9 9 0 1 0 9.9 9.9Z" stroke-linejoin="round"/></svg><svg class="ui-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" stroke-linecap="round"/></svg>');
  theme.addEventListener('click', () => document.getElementById('themeToggle')?.click());
  actions.append(theme); toolbar.append(start, actions); main.prepend(toolbar);
  let brandRow = nav.querySelector('.u040-top');
  if (!brandRow) {
    brandRow = document.createElement('div'); brandRow.className = 'u040-top';
    const mark = document.createElement('span'); mark.className = 'u040-logo';
    const name = document.createElement('span'); name.className = 'u040-name'; name.textContent = 'Đại đội 460';
    brandRow.append(mark, name); nav.prepend(brandRow);
  }
  const brand = nav.querySelector('.u040-logo'); if (brand) { brand.textContent = '460'; brand.setAttribute('aria-hidden', 'true'); }
  const close = document.createElement('button'); close.type = 'button'; close.className = 'ui-drawer-close ui-icon-button'; close.setAttribute('aria-label', 'Đóng menu');
  close.innerHTML = sanitizeHTML('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke-linecap="round"/></svg>');
  nav.prepend(close);
  const backdrop = document.createElement('button'); backdrop.type = 'button'; backdrop.className = 'ui-drawer-backdrop'; backdrop.hidden = true; backdrop.tabIndex = -1; backdrop.setAttribute('aria-label', 'Đóng menu điều hướng'); document.body.append(backdrop);
  const skip = document.createElement('a'); skip.className = 'ui-skip-link'; skip.href = '#interfacePageTitle'; skip.textContent = 'Đến nội dung'; document.body.prepend(skip); title.tabIndex = -1;
  let drawerOpen = false;
  function setDrawer(open, restoreFocus = true) {
    drawerOpen = Boolean(open && mobile.matches && AppState.role !== 'guest');
    document.body.classList.toggle('ui-menu-open', drawerOpen);
    backdrop.hidden = !drawerOpen; main.inert = drawerOpen; nav.inert = mobile.matches && !drawerOpen;
    if (mobile.matches) { toggle.setAttribute('aria-expanded', String(drawerOpen)); toggle.setAttribute('aria-label', drawerOpen ? 'Đóng menu' : 'Mở menu'); }
    else toggle.setAttribute('aria-expanded', String(shell.classList.contains('is-wide')));
    if (drawerOpen) close.focus(); else if (restoreFocus) toggle.focus({ preventScroll: true });
  }
  toggle.addEventListener('click', event => {
    if (!mobile.matches) return;
    event.preventDefault(); event.stopImmediatePropagation(); setDrawer(!drawerOpen);
  }, true);
  close.addEventListener('click', () => setDrawer(false)); backdrop.addEventListener('click', () => setDrawer(false));
  nav.addEventListener('click', event => { if (mobile.matches && event.target.closest('.nav-tab')) queueMicrotask(() => setDrawer(false)); });
  function setSearch(open) {
    if (!searchWrap) return;
    searchWrap.classList.toggle('ui-search-open', open); searchButton.setAttribute('aria-expanded', String(open));
    if (open) document.getElementById('bentoSearch')?.focus();
  }
  searchButton.addEventListener('click', () => setSearch(!searchWrap?.classList.contains('ui-search-open')));
  document.addEventListener('pointerdown', event => { if (!searchWrap?.contains(event.target) && !searchButton.contains(event.target)) setSearch(false); });
  document.addEventListener('keydown', event => {
    const editing = event.target.closest?.('input,textarea,select,[contenteditable="true"]');
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && AppState.role !== 'guest' && !document.querySelector('dialog[open]') && !AppState.isEditingForm) { event.preventDefault(); setSearch(true); }
    if (event.key === 'Escape') {
      if (drawerOpen) { event.preventDefault(); setDrawer(false); }
      else if (searchWrap?.classList.contains('ui-search-open') && !editing?.value) { setSearch(false); searchButton.focus(); }
    }
    if (drawerOpen && event.key === 'Tab') {
      const items = [...nav.querySelectorAll('button,a,input,select,[tabindex="0"]')].filter(el => !el.disabled && !el.closest('[inert]') && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
  mobile.addEventListener('change', () => { setDrawer(false, false); setSearch(false); });
  const labels = { 'tab-dashboard': 'Tổng quan', 'tab-sheet': 'Bảng điểm', 'tab-profiles': 'Hồ sơ quân nhân', 'tab-cumulative': 'Tiếng Nga · Tích lũy', 'tab-master': 'Toàn đại đội', 'tab-audit': 'Nhật ký', 'tab-settings': 'Môn học', 'tab-research': 'Nghiên cứu khoa học', 'tab-reports': 'Xuất báo cáo', 'tab-preferences': 'Cài đặt' };
  function sync() {
    for (const item of nav.querySelectorAll('.nav-tab')) {
      const span = item.querySelector('span'); const label = labels[item.dataset.tab];
      if (span && label && span.textContent !== label) span.textContent = label;
    }
    title.textContent = labels[AppState.activeTab] || 'Đại đội 460';
    const dark = document.documentElement.dataset.theme === 'dark';
    theme.setAttribute('aria-label', dark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'); theme.title = dark ? 'Giao diện sáng' : 'Giao diện tối';
    if (AppState.role === 'guest') { setDrawer(false, false); setSearch(false); }
  }
  let scheduled = false;
  const schedule = () => { if (scheduled) return; scheduled = true; requestAnimationFrame(() => { scheduled = false; sync(); }); };
  new MutationObserver(schedule).observe(nav, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
  new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.addEventListener('research-context-change', sync);
  registerExternalHooks({ renderInterface: sync });
  // Move only static help into disclosures. Error messages and live data are never collapsed.
  function help(content, label = 'Hướng dẫn') {
    if (!content || content.closest('details') || content.querySelector('[role="alert"]')) return;
    const details = document.createElement('details'); details.className = 'ui-help';
    const summary = document.createElement('summary'); summary.textContent = label;
    content.before(details); details.append(summary, content);
  }
  const quickTemplate = document.getElementById('btnDownloadQuickTemplate');
  const quickCard = quickTemplate?.closest('.bg-slate-50');
  if (quickCard) {
    const tools = document.createElement('div'); tools.className = 'ui-import-tools'; quickCard.before(tools); tools.append(quickTemplate);
    help(quickCard, 'Định dạng file');
  }
  help(document.querySelector('#modalImportExcel .p-5 > p'), 'Cách chuẩn bị file');
  for (const selector of ['#adminProfilesToolbar > div:first-child > div:first-child > p', '#tab-audit > div:first-child p', '.settings-intro > p', '.research-upload-description']) help(document.querySelector(selector));
  // Small copy, full meaning available on each report card's accessible download action.
  const descriptions = { researchReportCard: 'Đề tài, thành viên và giải thưởng.' };
  for (const card of document.querySelectorAll('.report-export-card')) {
    const p = card.querySelector('p'); if (!p) continue;
    const h = card.querySelector('h3')?.textContent;
    const short = descriptions[card.id] || ({ 'Bảng điểm lớp': 'Điểm học kỳ và cả năm.', 'Danh sách tiếng Nga': 'Trình độ và chuẩn ngoại ngữ.', 'Danh sách trích ngang': 'Hồ sơ và thông tin thân nhân.', 'Xếp hạng điểm': 'Xếp hạng và thành tích học tập.' })[h];
    if (short) { p.title = p.textContent; p.textContent = short; }
  }
  const academicLabel = document.querySelector('#dashboardKpis>div:first-child>div:first-child');
  if (academicLabel) academicLabel.textContent = 'Khá trở lên';
  setDrawer(false, false); sync();
}
