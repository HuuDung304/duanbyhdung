// Shared text normalization for Vietnamese searches. This does not modify stored data.
export function normalizeSearchText(value) {
  return String(value ?? '').toLocaleLowerCase('vi').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').trim();
}
