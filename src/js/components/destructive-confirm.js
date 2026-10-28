// A native modal dialog keeps destructive actions behind explicit, typed confirmation.
let pending = false;
export async function requestDestructiveConfirmation({ title, message, phrase }) {
  if (pending) return false;
  pending = true;
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'danger-confirm';
    dialog.setAttribute('aria-labelledby', 'dangerConfirmTitle');
    dialog.setAttribute('aria-describedby', 'dangerConfirmMessage');
    dialog.innerHTML = '<form method="dialog"><h2 id="dangerConfirmTitle"></h2><p id="dangerConfirmMessage"></p><label for="dangerConfirmInput"></label><input id="dangerConfirmInput" autocomplete="off" spellcheck="false"><div><button type="button" data-cancel>Hủy</button><button type="submit" data-confirm disabled>Xác nhận xóa</button></div></form>';
    dialog.querySelector('h2').textContent = title;
    dialog.querySelector('p').textContent = message;
    dialog.querySelector('label').textContent = `Nhập ${phrase} để xác nhận:`;
    const input = dialog.querySelector('input');
    const confirm = dialog.querySelector('[data-confirm]');
    input.addEventListener('input', () => { confirm.disabled = input.value.trim() !== phrase; });
    dialog.querySelector('[data-cancel]').addEventListener('click', () => dialog.close('cancel'));
    dialog.querySelector('form').addEventListener('submit', event => {
      event.preventDefault();
      if (input.value.trim() === phrase) dialog.close(phrase);
    });
    dialog.addEventListener('close', () => {
      const accepted = dialog.returnValue === phrase;
      dialog.remove(); pending = false; resolve(accepted);
    }, { once: true });
    document.body.append(dialog);
    dialog.showModal();
    dialog.querySelector('[data-cancel]').focus();
  });
}
