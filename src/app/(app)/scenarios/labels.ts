import { formatDateTime } from '@/app/_lib/dates';

/** Words shown on the scenario pages. */
export { DIFFICULTY_LABEL } from '@/app/_lib/labels';

export type ApprovalState = {
  approved: boolean;
  approvedRevision: number | null;
  approvedAt: Date | null;
  approvedByName: string | null;
};

/** What to say about who approved a scenario, and when. */
export function approvalLine(s: ApprovalState): string {
  const who = s.approvedByName ?? 'a clinician';
  const at = s.approvedAt ? ` on ${formatDateTime(s.approvedAt)}` : '';
  if (s.approved) return `Approved by ${who}${at}`;
  if (s.approvedRevision !== null) return `An earlier version was approved by ${who}${at}`;
  return 'Not approved yet';
}
