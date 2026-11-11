export const ROSTER_CLASS_ORDER = ['OTQS1', 'OTQS2', 'TTG1', 'TTG2', 'XMCB'];

const collator = new Intl.Collator('vi', { sensitivity: 'base', numeric: true });
const givenName = student => String(student.name || '').trim().split(/\s+/).at(-1) || '';

// Return a copy so sorting a report never mutates the application's student order.
export function sortStudentsForRoster(students) {
  return [...students].sort((a, b) => {
    const classA = ROSTER_CLASS_ORDER.indexOf(a.class);
    const classB = ROSTER_CLASS_ORDER.indexOf(b.class);
    return (classA < 0 ? ROSTER_CLASS_ORDER.length : classA) - (classB < 0 ? ROSTER_CLASS_ORDER.length : classB)
      || collator.compare(givenName(a), givenName(b))
      || collator.compare(String(a.name || ''), String(b.name || ''))
      || collator.compare(String(a.code || ''), String(b.code || ''));
  });
}
