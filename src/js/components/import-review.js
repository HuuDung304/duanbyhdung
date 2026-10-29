// Import review uses DOM text nodes so spreadsheet contents are never interpreted as HTML.
export function reviewImport({ title, details, rows = [], confirm = false }) {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.style.cssText = 'width:min(920px,94vw);max-height:85vh;border:1px solid #cbd5e1;border-radius:24px;padding:24px;color:#0f172a;background:white';
    dialog.setAttribute('aria-label', title);
    const heading = document.createElement('h2');
    heading.textContent = title;
    heading.style.cssText = 'font-size:22px;font-weight:800';
    const description = document.createElement('p');
    description.textContent = details;
    const content = document.createElement('pre');
    content.style.cssText = 'white-space:pre-wrap;overflow:auto;max-height:48vh;margin:20px 0;font:14px/1.7 system-ui';
    content.textContent = rows.join('\n');
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;justify-content:flex-end;gap:12px';
    const cancel = document.createElement('button');
    cancel.type = 'button'; cancel.textContent = confirm ? 'Hủy nhập' : 'Đóng';
    const finish = value => { dialog.close(); dialog.remove(); resolve(value); };
    cancel.onclick = () => finish(false);
    actions.append(cancel);
    if (confirm) {
      const accept = document.createElement('button');
      accept.type = 'button'; accept.textContent = 'Xác nhận nhập';
      accept.style.cssText = 'background:#4f46e5;color:white;border-radius:12px;padding:10px 16px';
      accept.onclick = () => finish(true);
      actions.append(accept);
    }
    dialog.append(heading, description, content, actions);
    dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
    document.body.append(dialog); dialog.showModal(); cancel.focus();
  });
}
