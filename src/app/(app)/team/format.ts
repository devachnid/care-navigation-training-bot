const dateTime = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London' });
const dateOnly = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'Europe/London' });

/** "12 Nov 2026, 14:05" in London time. */
export const formatDateTime = (d: Date): string => dateTime.format(d);

/** "12 Nov 2026" in London time. */
export const formatDate = (d: Date): string => dateOnly.format(d);

/** "Trainee" or "Manager". */
export const roleLabel = (role: 'trainee' | 'manager'): string => (role === 'manager' ? 'Manager' : 'Trainee');
