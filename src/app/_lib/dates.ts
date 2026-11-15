/**
 * The one place dates and times are written for people. Always UK time (Europe/London), whatever
 * the server's or the browser's clock says. Pages, tables and messages all use these.
 *
 *   formatDate     "12 Nov 2026"
 *   formatDateTime "12 Nov 2026, 14:05"
 *
 * Built from parts, not from `dateStyle`/`timeStyle`, because newer browsers and Node versions
 * write "12 Nov 2026 at 14:05" for those and the two formats would drift apart between machines.
 */
const dayParts = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });
const clockParts = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Europe/London' });
const monthParts = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'Europe/London' });

/** Some ICU versions write September as "Sept"; every month is three letters here. */
const shortMonth = (text: string): string => text.replace(' Sept ', ' Sep ');

/** "12 Nov 2026" in UK time. */
export const formatDate = (d: Date): string => shortMonth(dayParts.format(d));

/** "12 Nov 2026, 14:05" in UK time. */
export const formatDateTime = (d: Date): string => `${formatDate(d)}, ${clockParts.format(d)}`;

/** "November 2026" in UK time, for headings about a month. */
export const formatMonth = (d: Date): string => monthParts.format(d);

/** "2 min 30 s", "45 s", "10 min": a length of time said in words, for a sentence. Tables use m:ss under a "min:sec" heading. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const min = Math.floor(s / 60);
  const sec = s % 60;
  if (min === 0) return `${sec} s`;
  return sec === 0 ? `${min} min` : `${min} min ${sec} s`;
}
