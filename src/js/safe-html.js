import DOMPurify from './vendor/dompurify.js';
// Sanitize every dynamic HTML sink; textContent remains preferable for plain text.
export function sanitizeHTML(value) {
  const text = String(value ?? '');
  const tag = text.trim().match(/^<(tr|td|th|thead|tbody|tfoot|colgroup|caption)\b/i)?.[1]?.toLowerCase();
  const wrapper = tag === 'tr' ? ['<table><tbody>', '</tbody></table>', 'tbody'] : ['td','th'].includes(tag) ? ['<table><tbody><tr>', '</tr></tbody></table>', 'tr'] : tag ? ['<table>', '</table>', 'table'] : null;
  const clean = DOMPurify.sanitize(wrapper ? wrapper[0] + text + wrapper[1] : text, {
    USE_PROFILES: { html: true, svg: true },
    FORBID_TAGS: ['script','iframe','object','embed','style','link','meta','base'],
    FORBID_ATTR: ['srcdoc'],
    RETURN_TRUSTED_TYPE: false
  });
  if (!wrapper) return clean;
  const template = document.createElement('template'); template.innerHTML = clean;
  return template.content.querySelector(wrapper[2])?.innerHTML || '';
}
export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
}
