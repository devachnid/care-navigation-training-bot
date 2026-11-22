import type { SessionStatus } from '@/db/schema';
import type { TagTone } from '@/ui';

/**
 * Words used in more than one area, so a call, a result or a difficulty is called the same thing
 * on every page. "Staff" is the word for the people in a practice; "Team" is the name of the page
 * that manages them. A scenario is "shown" or "hidden" (never "switched on" or "off"), and is a
 * "draft" until a clinician has approved it.
 */
export const DIFFICULTY_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' } as const;

/** What happened to a call, in a list of calls. */
export const CALL_STATUS: Record<SessionStatus, string> = {
  created: 'Not started',
  in_call: 'Not finished',
  debriefing: 'Debrief being prepared',
  complete: 'Debrief ready',
  too_short: 'Too short: scored 0',
  failed: 'Debrief failed',
};

/** A person's latest call on a scenario. */
export type LatestResult = 'passed' | 'not_yet' | 'unsafe';
export const LATEST_RESULT: Record<LatestResult, { label: string; tone: TagTone }> = {
  passed: { label: 'Passed', tone: 'approved' },
  not_yet: { label: 'Not passed yet', tone: 'neutral' },
  unsafe: { label: 'Unsafe', tone: 'unsafe' },
};

export const roleLabel = (role: 'trainee' | 'manager'): string => (role === 'manager' ? 'Manager' : 'Trainee');
