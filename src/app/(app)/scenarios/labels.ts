/** Words and dates shown on the scenario pages. */

export const DIFFICULTY_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' } as const;

const when = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London' });

/** "12 Nov 2026, 14:05" in London time. */
export const formatWhen = (d: Date): string => when.format(d);

export type ApprovalState = {
  approved: boolean;
  approvedRevision: number | null;
  approvedAt: Date | null;
  approvedByName: string | null;
};

/** What to say about who approved a scenario, and when. */
export function approvalLine(s: ApprovalState): string {
  const who = s.approvedByName ?? 'a clinician';
  const at = s.approvedAt ? ` on ${formatWhen(s.approvedAt)}` : '';
  if (s.approved) return `Approved by ${who}${at}`;
  if (s.approvedRevision !== null) return `An earlier version was approved by ${who}${at}`;
  return 'Not approved yet';
}
