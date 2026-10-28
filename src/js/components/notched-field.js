// Lucian UX/UI Prompt #025 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#025
// Enhance the existing inputs in place: IDs, values and authentication handlers remain intact.
const refreshers = [];
document.querySelectorAll('.u025.u025-f').forEach(field => {
  const input = field.querySelector('.u025-in');
  const label = field.querySelector('.u025-lab');
  const line = field.querySelector('.u025-line');
  function lift() {
    const focused = document.activeElement === input;
    const up = focused || input.value.length > 0;
    field.classList.toggle('is-focus', focused);
    field.classList.toggle('is-up', up);
    line.style.setProperty('--gap', up ? `${label.offsetWidth * .8 + 2}px` : '0px');
  }
  ['focus', 'blur', 'input', 'change'].forEach(event => input.addEventListener(event, lift));
  input.form?.addEventListener('reset', () => requestAnimationFrame(lift));
  new ResizeObserver(lift).observe(label);
  refreshers.push(lift);
  lift();
});
document.fonts?.ready.then(() => refreshers.forEach(refresh => refresh()));
// Existing authentication messages remain the source of truth; never infer validity from a nonempty password.
for (const [formId, errorId] of [['formAdminLogin', 'loginAdminError'], ['formCadetLogin', 'loginCadetError']]) {
  const form = document.getElementById(formId);
  const error = document.getElementById(errorId);
  if (!form || !error) continue;
  error.setAttribute('aria-live', 'polite');
  const update = () => {
    const bad = !error.classList.contains('hidden');
    form.querySelectorAll('.u025-f').forEach(field => {
      const input = field.querySelector('input');
      field.classList.toggle('is-bad', bad);
      field.classList.remove('is-shake');
      if (bad) {
        input.setAttribute('aria-invalid', 'true');
        const ids = new Set((input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
        ids.add(errorId);
        input.setAttribute('aria-describedby', [...ids].join(' '));
        void field.offsetWidth;
        field.classList.add('is-shake');
      } else {
        input.removeAttribute('aria-invalid');
        const ids = (input.getAttribute('aria-describedby') || '').split(/\s+/).filter(id => id && id !== errorId);
        if (ids.length) input.setAttribute('aria-describedby', ids.join(' '));
        else input.removeAttribute('aria-describedby');
      }
    });
  };
  new MutationObserver(update).observe(error, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
  new MutationObserver(() => refreshers.forEach(refresh => refresh())).observe(form, { attributes: true, attributeFilter: ['class'] });
  update();
}
