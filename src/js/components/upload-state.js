// Real FileReader progress and parse completion; never represents database upload progress.
const activeReaders = new Map();
export function cancelImportRead(inputId) {
  const previous = activeReaders.get(inputId);
  activeReaders.delete(inputId);
  if (previous && previous.readyState === 1) previous.abort();
}
export function trackImportRead(reader, file, inputId, confirmId) {
  cancelImportRead(inputId);
  activeReaders.set(inputId, reader);
  const report = (state, progress = 0, message = '') => {
    if (activeReaders.get(inputId) !== reader) return;
    document.getElementById(inputId)?.dispatchEvent(new CustomEvent('import-file-state', {
      detail: { file, state, progress, message }, bubbles: true
    }));
  };
  report('reading');
  reader.addEventListener('progress', event => {
    if (event.lengthComputable) report('reading', Math.min(1, event.loaded / event.total));
  });
  reader.addEventListener('error', () => report('failed', 0, 'Không đọc được file. Hãy thử lại hoặc chọn file khác.'));
  reader.addEventListener('abort', () => report('failed', 0, 'Đã dừng đọc file.'));
  reader.addEventListener('loadend', () => {
    if (activeReaders.get(inputId) !== reader) return;
    if (reader.error || reader.readyState !== 2) { activeReaders.delete(inputId); return; }
    const valid = document.getElementById(confirmId)?.disabled === false;
    report(valid ? 'ready' : 'failed', valid ? 1 : 0,
      valid ? 'Đã đọc và kiểm tra file · Chưa lưu database' : 'Không có dữ liệu hợp lệ. Kiểm tra thông báo lỗi và định dạng file.');
    activeReaders.delete(inputId);
  });
}
