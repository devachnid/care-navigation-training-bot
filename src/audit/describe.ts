/** What the "Recent changes" list knows about one entry. Names are filled in by `listAuditEntries`. */
export type AuditEntryFacts = {
  action: string;
  /** The name of the person the change is about, when the entry points at a person. */
  targetName: string | null;
  /** The scenario title or invitation name the entry points at, when it does. */
  subjectName: string | null;
  detail: Record<string, unknown> | null;
};

const roleWord = (role: unknown) => (role === 'manager' ? 'a manager' : role === 'trainee' ? 'a trainee' : 'a team member');

const retentionWords = (days: unknown): string => {
  if (days === null) return 'kept until they are deleted';
  if (typeof days !== 'number') return 'kept for a set time';
  if (days % 365 === 0) return `kept for ${days / 365 === 1 ? '1 year' : `${days / 365} years`}`;
  return `kept for ${days} days`;
};

function settingsSentence(detail: Record<string, unknown> | null): string {
  const parts: string[] = [];
  if (detail && typeof detail.name === 'string') parts.push(`Renamed the practice to ${detail.name}`);
  if (detail && typeof detail.allowDraftScenarios === 'boolean') {
    parts.push(detail.allowDraftScenarios ? 'Let staff practise on draft scenarios' : 'Stopped staff practising on draft scenarios');
  }
  if (detail && 'transcriptRetentionDays' in detail) parts.push(`Chose to have transcripts ${retentionWords(detail.transcriptRetentionDays)}`);
  return parts.length > 0 ? parts.join('. ') : 'Changed the practice settings';
}

/**
 * One plain sentence for an audit entry, without the name of whoever did it (that has its own
 * column). Every action the backend writes is here; an unknown one gets a readable fallback.
 */
export function describeAudit(e: AuditEntryFacts): string {
  const person = e.targetName ?? 'a person who is no longer listed';
  const subject = e.subjectName ?? (typeof e.detail?.title === 'string' ? e.detail.title : 'a scenario');
  const invitee = e.subjectName ?? (typeof e.detail?.email === 'string' ? e.detail.email : 'someone');
  const approver = e.detail?.canApproveScenarios === true ? ', who can approve scenarios' : '';

  switch (e.action) {
    case 'setup.completed':
      return 'Set up the service';
    case 'practice.created':
      return typeof e.detail?.name === 'string' ? `Set up the practice ${e.detail.name}` : 'Set up the practice';
    case 'practice.suspended':
      return 'Suspended the practice';
    case 'practice.restored':
      return 'Restored the practice';
    case 'practice.settings_changed':
      return settingsSentence(e.detail);
    case 'member.added':
      return `Added ${person} as ${roleWord(e.detail?.role)}${approver}`;
    case 'member.invited':
      return `Invited ${invitee} as ${roleWord(e.detail?.role)}${approver}`;
    case 'invitation.revoked':
      return e.detail?.kind === 'reset'
        ? `Cancelled the password reset link for ${invitee}`
        : `Cancelled the invitation for ${invitee}`;
    case 'invitation.accepted':
      return `Accepted the invitation and joined as ${roleWord(e.detail?.role)}`;
    case 'reset_link.created':
      return `Made a password reset link for ${person}`;
    case 'password.reset':
      return 'Set a new password with a reset link';
    case 'user.password_changed':
      return 'Changed their password';
    case 'member.role_changed':
      return `Changed ${person} to ${roleWord(e.detail?.role)}`;
    case 'member.approver_changed':
      return e.detail?.canApproveScenarios === true ? `Let ${person} approve scenarios` : `Stopped ${person} approving scenarios`;
    case 'member.deactivated':
      return `Deactivated ${person}`;
    case 'member.reactivated':
      return `Reactivated ${person}`;
    case 'scenario.created':
      return `Wrote the scenario ${subject}`;
    case 'scenario.updated':
      return `Changed the scenario ${subject}`;
    case 'scenario.activated':
      return `Switched on the scenario ${subject}`;
    case 'scenario.deactivated':
      return `Switched off the scenario ${subject}`;
    case 'scenario.approved':
      return `Approved the scenario ${subject}`;
    case 'transcripts.expired': {
      const n = e.detail?.sessions;
      const calls = typeof n === 'number' ? (n === 1 ? '1 call' : `${n} calls`) : 'some calls';
      return `Deleted the transcripts and quoted lines of ${calls}, as the time the practice keeps them had passed`;
    }
    case 'scenario.added_from_library':
      return `Added the scenario ${subject} from the library`;
    default:
      return `Made a change (${e.action.replace(/[._]+/g, ' ').trim() || 'unknown'})`;
  }
}
