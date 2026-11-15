import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { describeAudit, type AuditEntryFacts } from './describe';

const facts = (action: string, over: Partial<AuditEntryFacts> = {}): AuditEntryFacts => ({
  action,
  targetName: null,
  subjectName: null,
  detail: null,
  ...over,
});

describe('describeAudit', () => {
  it.each<[string, Partial<AuditEntryFacts>, string]>([
    ['setup.completed', {}, 'Set up the service'],
    ['practice.created', { detail: { name: 'Ty Gwyn' } }, 'Set up the practice Ty Gwyn'],
    ['practice.created', {}, 'Set up the practice'],
    ['practice.suspended', {}, 'Suspended the practice'],
    ['practice.restored', {}, 'Restored the practice'],
    ['member.added', { targetName: 'Aisha Rahman', detail: { role: 'manager' } }, 'Added Aisha Rahman as a manager'],
    [
      'member.added',
      { targetName: 'Aisha Rahman', detail: { role: 'trainee', canApproveScenarios: true } },
      'Added Aisha Rahman as a trainee, who can approve scenarios',
    ],
    ['member.invited', { subjectName: 'Siobhan Kearney', detail: { role: 'trainee', email: 's@example.com' } }, 'Invited Siobhan Kearney as a trainee'],
    ['member.invited', { detail: { role: 'manager', email: 's@example.com' } }, 'Invited s@example.com as a manager'],
    ['invitation.revoked', { subjectName: 'Siobhan Kearney', detail: { kind: 'invite' } }, 'Cancelled the invitation for Siobhan Kearney'],
    ['invitation.revoked', { subjectName: 'Siobhan Kearney', detail: { kind: 'reset' } }, 'Cancelled the password reset link for Siobhan Kearney'],
    ['invitation.accepted', { detail: { role: 'trainee' } }, 'Accepted the invitation and joined as a trainee'],
    ['reset_link.created', { targetName: 'Tom Hughes' }, 'Made a password reset link for Tom Hughes'],
    ['password.reset', {}, 'Set a new password with a reset link'],
    ['reset_link.admin_created', { targetName: 'Tom Hughes' }, 'The service administrator created a password reset link for Tom Hughes'],
    ['password.admin_reset', { targetName: 'Tom Hughes' }, 'Tom Hughes set a new password using a link from the service administrator'],
    ['user.password_changed', {}, 'Changed their password'],
    ['member.role_changed', { targetName: 'Tom Hughes', detail: { role: 'manager' } }, 'Changed Tom Hughes to a manager'],
    ['member.role_changed', { targetName: 'Tom Hughes', detail: { role: 'trainee' } }, 'Changed Tom Hughes to a trainee'],
    ['member.approver_changed', { targetName: 'Tom Hughes', detail: { canApproveScenarios: true } }, 'Let Tom Hughes approve scenarios'],
    ['member.approver_changed', { targetName: 'Tom Hughes', detail: { canApproveScenarios: false } }, 'Stopped Tom Hughes approving scenarios'],
    ['member.deactivated', { targetName: 'Tom Hughes' }, 'Deactivated Tom Hughes'],
    ['member.reactivated', { targetName: 'Tom Hughes' }, 'Reactivated Tom Hughes'],
    ['scenario.created', { subjectName: 'Sore throat' }, 'Wrote the scenario Sore throat'],
    ['scenario.updated', { subjectName: 'Sore throat' }, 'Changed the scenario Sore throat'],
    ['scenario.activated', { subjectName: 'Sore throat' }, 'Switched on the scenario Sore throat'],
    ['scenario.deactivated', { subjectName: 'Sore throat' }, 'Switched off the scenario Sore throat'],
    ['scenario.approved', { subjectName: 'Sore throat' }, 'Approved the scenario Sore throat'],
    ['transcripts.expired', { detail: { sessions: 3 } }, 'Deleted the transcripts and quoted lines of 3 calls, as the time the practice keeps them had passed'],
    ['transcripts.expired', { detail: { sessions: 1 } }, 'Deleted the transcripts and quoted lines of 1 call, as the time the practice keeps them had passed'],
    ['scenario.added_from_library', { subjectName: 'Sore throat' }, 'Added the scenario Sore throat from the library'],
  ])('%s', (action, over, expected) => {
    expect(describeAudit(facts(action, over))).toBe(expected);
  });

  it('describes each practice setting that changed', () => {
    expect(describeAudit(facts('practice.settings_changed', { detail: { name: 'New Surgery' } }))).toBe('Renamed the practice to New Surgery');
    expect(describeAudit(facts('practice.settings_changed', { detail: { allowDraftScenarios: true } }))).toBe(
      'Let staff practise on draft scenarios',
    );
    expect(describeAudit(facts('practice.settings_changed', { detail: { allowDraftScenarios: false } }))).toBe(
      'Stopped staff practising on draft scenarios',
    );
    expect(describeAudit(facts('practice.settings_changed', { detail: { transcriptRetentionDays: null } }))).toBe(
      'Chose to have transcripts kept until they are deleted',
    );
    expect(describeAudit(facts('practice.settings_changed', { detail: { transcriptRetentionDays: 90 } }))).toBe(
      'Chose to have transcripts kept for 90 days',
    );
    expect(describeAudit(facts('practice.settings_changed', { detail: { transcriptRetentionDays: 365 } }))).toBe(
      'Chose to have transcripts kept for 1 year',
    );
    expect(describeAudit(facts('practice.settings_changed', { detail: { transcriptRetentionDays: 730 } }))).toBe(
      'Chose to have transcripts kept for 2 years',
    );
    expect(
      describeAudit(facts('practice.settings_changed', { detail: { name: 'A', allowDraftScenarios: true, transcriptRetentionDays: 180 } })),
    ).toBe('Renamed the practice to A. Let staff practise on draft scenarios. Chose to have transcripts kept for 180 days');
    expect(describeAudit(facts('practice.settings_changed'))).toBe('Changed the practice settings');
  });

  it('copes with names it could not look up', () => {
    expect(describeAudit(facts('member.deactivated'))).toBe('Deactivated a person who is no longer listed');
    expect(describeAudit(facts('scenario.approved', { detail: { title: 'Chest pain' } }))).toBe('Approved the scenario Chest pain');
    expect(describeAudit(facts('scenario.approved'))).toBe('Approved the scenario a scenario');
    expect(describeAudit(facts('member.invited'))).toBe('Invited someone as a team member');
  });

  it('falls back to a readable sentence for an action it does not know', () => {
    expect(describeAudit(facts('report.exported'))).toBe('Made a change (report exported)');
    expect(describeAudit(facts('weird_thing.did_it'))).toBe('Made a change (weird thing did it)');
    expect(describeAudit(facts(''))).toBe('Made a change (unknown)');
  });

  it('knows every action the code base writes to the audit log', () => {
    const root = path.resolve(import.meta.dirname, '..');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(full);
      }
    };
    walk(root);
    const actions = new Set<string>();
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const m of source.matchAll(/\baudit\(\s*[^,]+,\s*'([a-z_]+\.[a-z_]+)'/g)) actions.add(m[1]);
      // `audit(actor, active ? 'a.b' : 'a.c', ...)`
      for (const m of source.matchAll(/\baudit\([^;]*?\?\s*'([a-z_]+\.[a-z_]+)'\s*:\s*'([a-z_]+\.[a-z_]+)'/g)) {
        actions.add(m[1]);
        actions.add(m[2]);
      }
    }
    expect(actions.size).toBeGreaterThanOrEqual(20);
    for (const action of actions) {
      expect(describeAudit(facts(action, { targetName: 'T', subjectName: 'S' })), action).not.toMatch(/^Made a change/);
    }
  });
});
