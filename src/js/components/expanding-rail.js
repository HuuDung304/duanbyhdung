// Lucian UX/UI Prompt #040 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#040

/** Enhance the existing navigation without replacing application buttons or handlers. */
export function mountExpandingRail(nav, main) {
  if (!nav || !main || nav.closest('.u040')) return;
  const root = document.createElement('div');
  root.className = 'u040';
  nav.before(root);
  root.append(nav, main);
  nav.classList.add('u040-rail');
  nav.setAttribute('aria-label', 'Điều hướng Đại đội 460');
  main.classList.add('u040-main');
  // Existing forms retain their light palette; the new shell owns its theme.
  const content = document.createElement('div');
  content.className = 'u040-content';
  content.append(...main.childNodes);
  main.append(content);

  const top = document.createElement('div');
  top.className = 'u040-top';
  top.innerHTML = '<span class="u040-logo" aria-hidden="true"></span><span class="u040-name">Đại đội 460</span>';
  const toggle = document.createElement('button');
  toggle.className = 'u040-tog';
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', 'Mở rộng menu');
  toggle.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5L10.5 8 6 12.5"/></svg>';

  const buttons = [...nav.querySelectorAll('.nav-tab')];
  const oldContainer = buttons[0]?.parentElement;
  if (!buttons.length) { root.replaceWith(nav, main); return; }
  const list = document.createElement('ul');
  list.className = 'u040-nav';
  list.id = 'u040-navigation-items';
  toggle.setAttribute('aria-controls', list.id);
  const highlight = document.createElement('li');
  highlight.className = 'u040-hl';
  highlight.setAttribute('role', 'presentation');
  highlight.setAttribute('aria-hidden', 'true');
  list.append(highlight);
  buttons.forEach((button, index) => {
    button.classList.add('u040-it');
    button.type = 'button';
    button.style.setProperty('--i', index);
    button.setAttribute('aria-controls', button.dataset.tab);
    button.querySelector('svg')?.setAttribute('aria-hidden', 'true');
    if (!button.querySelector('span')) {
      const label = document.createElement('span');
      [...button.childNodes].filter(node => node.nodeType === Node.TEXT_NODE)
        .forEach(node => label.append(node));
      button.append(label);
    }
    const item = document.createElement('li');
    item.append(button);
    list.append(item);
  });
  if (oldContainer !== nav) oldContainer.remove();

  const profile = document.createElement('div');
  profile.className = 'u040-me';
  profile.innerHTML = '<i aria-hidden="true"></i><span><b></b><small></small></span>';
  nav.prepend(top, toggle, list, profile);
  const heading = document.createElement('div');
  heading.className = 'u040-page-heading';
  heading.innerHTML = '<small>Đại đội 460</small><h2 aria-live="polite" aria-atomic="true"></h2>';
  main.prepend(heading);
  const title = heading.querySelector('h2');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let titleTimer;
  let selectedLabel = '';

  const visibleButtons = () => buttons.filter(button => !button.hidden
    && !button.classList.contains('hidden') && button.style.display !== 'none');
  function syncNavigation() {
    root.hidden = nav.classList.contains('hidden') || nav.style.display === 'none';
    const visible = visibleButtons();
    const active = visible.find(button => button.classList.contains('active')) || visible[0];
    buttons.forEach(button => {
      const label = button.querySelector('span').textContent.trim();
      button.setAttribute('aria-label', label);
      button.title = label;
      button.parentElement.hidden = !visible.includes(button);
      if (button === active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    highlight.hidden = !active;
    if (!active) return;
    highlight.style.setProperty('--y', `${active.parentElement.offsetTop}px`);
    const label = active.querySelector('span').textContent.trim();
    if (selectedLabel === label) return;
    selectedLabel = label;
    clearTimeout(titleTimer);
    if (!title.textContent || reducedMotion.matches) {
      title.textContent = label;
      title.classList.remove('swap');
    } else {
      title.classList.add('swap');
      titleTimer = setTimeout(() => {
        if (!root.isConnected) return;
        title.textContent = selectedLabel;
        title.classList.remove('swap');
      }, 180);
    }
  }
  toggle.addEventListener('click', () => {
    const wide = !root.classList.contains('is-wide');
    root.classList.toggle('is-wide', wide);
    toggle.setAttribute('aria-expanded', String(wide));
    toggle.setAttribute('aria-label', wide ? 'Thu gọn menu' : 'Mở rộng menu');
  });
  list.addEventListener('keydown', event => {
    const visible = visibleButtons();
    const current = visible.indexOf(event.target.closest('.u040-it'));
    if (current < 0) return;
    let next;
    if (event.key === 'ArrowDown') next = (current + 1) % visible.length;
    if (event.key === 'ArrowUp') next = (current - 1 + visible.length) % visible.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = visible.length - 1;
    if (next !== undefined) { event.preventDefault(); visible[next].focus(); }
  });
  // The existing delegated click handler remains responsible for authorization and tab state.
  new MutationObserver(records => {
    if (records.some(record => record.target === nav
      || (record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement)?.closest('.nav-tab'))) {
      syncNavigation();
    }
  }).observe(nav, { subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'], childList: true, characterData: true });
  const userTitle = document.getElementById('authUserTitle');
  const userRole = document.getElementById('authRoleDesc');
  function syncProfile() {
    profile.querySelector('b').textContent = userTitle?.textContent.trim() || '';
    profile.querySelector('small').textContent = userRole?.textContent.trim() || '';
  }
  const profileObserver = new MutationObserver(syncProfile);
  for (const element of [userTitle, userRole]) {
    if (element) profileObserver.observe(element, { childList: true, subtree: true, characterData: true });
  }
  new ResizeObserver(syncNavigation).observe(list);
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) {
      clearTimeout(titleTimer);
      title.textContent = selectedLabel;
      title.classList.remove('swap');
    }
  });
  syncProfile();
  syncNavigation();
}

mountExpandingRail(document.querySelector('nav'), document.querySelector('main'));
