import { RUBRIC } from '@/debrief/rubric';
import { toCsv, type CsvCell } from './csv';
import type { ExportRow } from './dal';

const LONDON = 'Europe/London';
const dateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: LONDON,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const timeFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: LONDON,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** `2026-11-15`, the date in London. */
export const londonDate = (d: Date): string => dateFormat.format(d);
/** `14:05`, the time in London. */
export const londonTime = (d: Date): string => timeFormat.format(d);

export const EXPORT_HEADER: string[] = [
  'Date',
  'Time (Europe/London)',
  'Name',
  'Email',
  'Scenario',
  'Difficulty',
  'Draft scenario',
  'Length (seconds)',
  'Result',
  'Score',
  'Outcome correct',
  'Unsafe outcome',
  'Red flag handled',
  ...RUBRIC.map(r => r.label),
];

const yesNo = (v: boolean) => (v ? 'Yes' : 'No');

export function exportResult(
  r: Pick<ExportRow, 'status' | 'unsafeOutcome' | 'outcomeCorrect'>,
): 'Too short' | 'Unsafe' | 'Passed' | 'Not yet' {
  if (r.status === 'too_short') return 'Too short';
  if (r.unsafeOutcome) return 'Unsafe';
  return r.outcomeCorrect ? 'Passed' : 'Not yet';
}

export function exportCells(r: ExportRow): CsvCell[] {
  return [
    londonDate(r.startedAt),
    londonTime(r.startedAt),
    r.name,
    r.email,
    r.title,
    r.difficulty.charAt(0).toUpperCase() + r.difficulty.slice(1),
    yesNo(!r.approved),
    r.durationSeconds,
    exportResult(r),
    r.score,
    yesNo(r.outcomeCorrect),
    yesNo(r.unsafeOutcome),
    r.redFlagHandled === null ? 'Not applicable' : yesNo(r.redFlagHandled),
    ...RUBRIC.map(item => r.rubricScores?.[item.key]?.score ?? null),
  ];
}

/** The whole download: header and one row per call. */
export function exportCsv(rows: ExportRow[]): string {
  return toCsv(EXPORT_HEADER, rows.map(exportCells));
}

/** `call-practice-ty-gwyn-surgery-2026-11-15.csv`. The name is reduced to plain lower-case letters, digits and hyphens. */
export function exportFilename(practiceName: string, now: Date): string {
  const slug = practiceName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return `call-practice-${slug || 'practice'}-${londonDate(now)}.csv`;
}
