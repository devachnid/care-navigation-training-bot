import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { CSSProperties, ReactNode } from 'react';
import {
  Alert,
  AppShell,
  Button,
  Card,
  Checkbox,
  ConfirmButton,
  CopyField,
  DataTable,
  EmptyState,
  ErrorSummary,
  Field,
  Fieldset,
  PageHeader,
  RadioGroup,
  Section,
  Stat,
  StatGroup,
  SubmitButton,
  SubNav,
  Tag,
} from '@/ui';

// Only for developers: never served in production.
export const metadata = { title: 'Style guide', robots: { index: false, follow: false } };

async function signOutDemo() {
  'use server';
}

async function slowSaveDemo() {
  'use server';
  await new Promise(resolve => setTimeout(resolve, 2500));
}

const row: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' };
const stack: CSSProperties = { display: 'grid', gap: '1.5rem' };

function Demo({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gap: '0.75rem' }}>
      <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--muted)' }}>{title}</h3>
      {children}
    </div>
  );
}

const people = [
  { id: 'u1', name: 'Aisha Rahman', role: 'Manager', calls: 34, best: 96, average: 84, last: '12 Nov 2026', unsafe: 0, longest: '8:42', status: 'Active' },
  { id: 'u2', name: 'Callum Ferguson', role: 'Trainee', calls: 12, best: 78, average: 66, last: '14 Nov 2026', unsafe: 1, longest: '9:58', status: 'Active' },
  { id: 'u3', name: 'Mrs Bronwen Pritchard', role: 'Trainee', calls: 7, best: 88, average: 79, last: '9 Nov 2026', unsafe: 0, longest: '6:15', status: 'Active' },
  { id: 'u4', name: 'Dr Imran Hussain', role: 'Trainee, approver', calls: 3, best: 91, average: 87, last: '2 Nov 2026', unsafe: 0, longest: '5:03', status: 'Active' },
  { id: 'u5', name: 'Siobhan Kearney', role: 'Trainee', calls: 0, best: 0, average: 0, last: 'Never', unsafe: 0, longest: '0:00', status: 'Invited' },
  { id: 'u6', name: 'Terrence Oduya', role: 'Trainee', calls: 19, best: 82, average: 71, last: '30 Sep 2026', unsafe: 2, longest: '9:12', status: 'Deactivated' },
];

const tone = { Active: 'approved', Invited: 'draft', Deactivated: 'neutral' } as const;

export default function StyleguidePage() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <AppShell
      userName="Aisha Rahman"
      practiceName="Millbrook Surgery"
      nav={[
        { href: '/', label: 'Practise' },
        { href: '/history', label: 'My calls' },
        { href: '/team', label: 'Team' },
        { href: '/reports', label: 'Reports' },
        { href: '/scenarios', label: 'Scenarios' },
        { href: '/styleguide', label: 'Style guide' },
      ]}
      signOutAction={signOutDemo}
    >
      <PageHeader
        back={{ href: '/', label: 'Back to practice' }}
        eyebrow="Developers only"
        title="Style guide"
        lead="Every shared component in src/ui, in each variant and state. This page returns 'not found' in production."
        actions={
          <>
            <Button variant="secondary" href="#forms">
              Jump to forms
            </Button>
            <Button href="#tables">Jump to tables</Button>
          </>
        }
      />

      <Section title="Buttons" description="Blue is the main action on a page, green means start the call, red means stop or remove.">
        <div style={stack}>
          <Demo title="Default size">
            <div style={row}>
              <Button>Save changes</Button>
              <Button variant="secondary">Cancel</Button>
              <Button variant="go">Start the call</Button>
              <Button variant="danger">Hang up</Button>
              <Button variant="link">Forgotten your password?</Button>
            </div>
          </Demo>
          <Demo title="Large">
            <div style={row}>
              <Button size="large">Choose a call</Button>
              <Button size="large" variant="go">
                Start the call
              </Button>
              <Button size="large" variant="danger">
                Hang up
              </Button>
              <Button size="large" variant="secondary">
                Back to the list
              </Button>
            </div>
          </Demo>
          <Demo title="Disabled and pending">
            <div style={row}>
              <Button disabled>Save changes</Button>
              <Button variant="secondary" disabled>
                Cancel
              </Button>
              <Button variant="go" disabled>
                Start the call
              </Button>
              <Button variant="danger" disabled>
                Hang up
              </Button>
              <Button variant="link" disabled>
                Forgotten your password?
              </Button>
              <Button pending>Saving&hellip;</Button>
              <Button variant="go" pending>
                Starting&hellip;
              </Button>
            </div>
          </Demo>
          <Demo title="As links (a real link, not a button)">
            <div style={row}>
              <Button href="/history">My past calls</Button>
              <Button href="/history" variant="secondary">
                See all calls
              </Button>
              <Button href="/history" variant="link">
                Privacy notice
              </Button>
              <Button href="/history" disabled>
                Disabled link
              </Button>
            </div>
          </Demo>
          <Demo title="Submit button (pending label while the form is sent) and confirm button">
            <form action={slowSaveDemo} style={row}>
              <SubmitButton pendingLabel="Saving&hellip;">Save settings</SubmitButton>
              <ConfirmButton
                label="Deactivate"
                question="Terrence Oduya will not be able to sign in. His past calls stay in your reports."
                name="userId"
                value="u6"
              />
            </form>
            <p style={{ margin: 0, color: 'var(--muted)' }}>
              Press Save settings to see the pending state (about two and a half seconds). Press Deactivate to see the second step; Escape or Cancel goes back.
            </p>
          </Demo>
        </div>
      </Section>

      <Section title="Alerts" description="The tone is written out for screen readers as well as coloured.">
        <div style={stack}>
          <Alert tone="info" title="Calls are simulated">
            <p>The caller is an AI voice. Please do not use real patient details.</p>
          </Alert>
          <Alert tone="success" title="Invitation created">
            <p>Copy the link below and send it to Siobhan Kearney. It works once and expires in 7 days.</p>
          </Alert>
          <Alert tone="warning" title="This scenario is still a draft">
            <p>A clinician has not approved the latest changes. Trainees will not see it unless draft scenarios are switched on in settings.</p>
          </Alert>
          <Alert tone="error" title="We could not save your changes">
            <p>Check your connection and try again. If it keeps happening, tell your practice manager.</p>
          </Alert>
          <Alert tone="unsafe" title="This call was unsafe">
            <p>You told the caller to wait for a routine appointment when she described chest pain spreading to her arm. She should have been told to call 999.</p>
          </Alert>
        </div>
      </Section>

      <Section title="Tags" description="Short labels. The word matters; the colour only helps.">
        <div style={stack}>
          <Demo title="Difficulty">
            <div style={row}>
              <Tag tone="easy">Easy</Tag>
              <Tag tone="medium">Medium</Tag>
              <Tag tone="hard">Hard</Tag>
            </div>
          </Demo>
          <Demo title="Status">
            <div style={row}>
              <Tag tone="neutral">Invited</Tag>
              <Tag tone="draft">Draft</Tag>
              <Tag tone="approved">Approved</Tag>
              <Tag tone="unsafe">Unsafe</Tag>
            </div>
          </Demo>
        </div>
      </Section>

      <Section title="Cards" description="One panel for one thing.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(20rem, 1fr))', gap: '1rem' }}>
          <Card
            title="Chest pain on the phone"
            actions={<Tag tone="hard">Hard</Tag>}
          >
            <p>A woman in her sixties rings for a repeat prescription and mentions tightness in her chest.</p>
            <div style={row}>
              <Tag tone="approved">Approved</Tag>
              <span style={{ color: 'var(--muted)' }}>Best score 72 out of 100</span>
            </div>
            <div style={row}>
              <Button variant="go">Start the call</Button>
            </div>
          </Card>
          <Card title="Rash on a toddler" actions={<Tag tone="medium">Medium</Tag>}>
            <p>A father is worried about a rash that has not faded under a glass.</p>
            <div style={row}>
              <Tag tone="draft">Draft</Tag>
              <span style={{ color: 'var(--muted)' }}>Not attempted yet</span>
            </div>
            <div style={row}>
              <Button variant="go">Start the call</Button>
            </div>
          </Card>
          <Card as="section" tone="quiet" title="Quiet card" headingLevel={3}>
            <p>No border, for grouping inside a page without adding weight.</p>
          </Card>
        </div>
      </Section>

      <div id="forms">
        <Section title="Forms" description="Labels above fields, hints under labels, errors in words.">
          <form action={slowSaveDemo} style={{ display: 'grid', gap: '1.5rem', maxWidth: '44rem' }} noValidate>
            <ErrorSummary
              autoFocus={false}
              errors={[
                { message: 'Enter the person’s full name', href: '#invite-name' },
                { message: 'Enter an email address in the right format, like name@example.com', href: '#invite-email' },
                { message: 'Choose a role', href: '#invite-role' },
              ]}
            />
            <Field label="Full name" name="name" id="invite-name" autoComplete="off" error="Enter the person’s full name" />
            <Field
              label="Email address"
              name="email"
              id="invite-email"
              type="email"
              autoComplete="off"
              hint="We do not send email. You will be given a link to pass on."
              defaultValue="siobhan.kearney@"
              error="Enter an email address in the right format, like name@example.com"
            />
            <Field as="select" label="Practice" name="practice" id="invite-practice" defaultValue="millbrook">
              <option value="millbrook">Millbrook Surgery</option>
              <option value="riverside">Riverside Health Centre</option>
            </Field>
            <RadioGroup
              legend="Role"
              name="role"
              id="invite-role"
              hint="Managers can see everyone’s calls and manage the team."
              error="Choose a role"
              options={[
                { value: 'trainee', label: 'Trainee', hint: 'Takes calls and sees their own results.' },
                { value: 'manager', label: 'Manager', hint: 'Also invites staff and sees reports.' },
              ]}
            />
            <Fieldset legend="Permissions" hint="Choose all that apply.">
              <Checkbox name="approver" label="Can approve scenarios" hint="For a clinician who checks scenarios against your protocols." />
              <Checkbox name="drafts" label="Can take calls on draft scenarios" defaultChecked />
              <Checkbox name="locked" label="Platform admin (not available)" disabled />
            </Fieldset>
            <Field
              as="textarea"
              label="Notes for the team"
              name="notes"
              id="invite-notes"
              hint="Optional. Do not include patient details."
              defaultValue="Joins the front desk team on Monday."
            />
            <Field label="Practice code" name="code" id="invite-code" defaultValue="MB-204" disabled />
            <Field
              label="Email address"
              name="locked-email"
              id="invite-locked-email"
              defaultValue="aisha.rahman@example.test"
              readOnly
              hint="Read only: shown so it can be checked, not changed."
            />
            <div style={row}>
              <SubmitButton pendingLabel="Creating link&hellip;">Create invitation</SubmitButton>
              <Button variant="link" href="/team">
                Cancel
              </Button>
            </div>
          </form>
        </Section>
      </div>

      <div id="tables">
        <Section title="Table" description="Ten columns at 1024 pixels wide: the table scrolls inside its own box, which you can reach with the Tab key.">
          <DataTable
            caption="Team calls this month"
            showCaption
            rows={people}
            rowKey={p => p.id}
            columns={[
              { key: 'name', header: 'Name', rowHeader: true, cell: p => <Link href={`/team/${p.id}`}>{p.name}</Link> },
              { key: 'role', header: 'Role' },
              { key: 'calls', header: 'Calls', numeric: true },
              { key: 'best', header: 'Best score', numeric: true, cell: p => (p.calls ? `${p.best}/100` : 'None') },
              { key: 'average', header: 'Average', numeric: true, cell: p => (p.calls ? `${p.average}/100` : 'None') },
              { key: 'unsafe', header: 'Unsafe calls', numeric: true, cell: p => (p.unsafe ? <Tag tone="unsafe">{p.unsafe}</Tag> : '0') },
              { key: 'longest', header: 'Longest call', numeric: true },
              { key: 'last', header: 'Last call', nowrap: true },
              { key: 'status', header: 'Status', cell: p => <Tag tone={tone[p.status as keyof typeof tone]}>{p.status}</Tag> },
              {
                key: 'actions',
                header: 'Actions',
                cell: p => (p.status === 'Deactivated' ? <Button variant="link">Reactivate</Button> : <Button variant="link">Reset link</Button>),
              },
            ]}
          />
          <div style={{ marginTop: '2rem' }}>
            <DataTable
              caption="Calls on draft scenarios"
              showCaption
              rows={[] as typeof people}
              rowKey={p => p.id}
              columns={[
                { key: 'name', header: 'Name', rowHeader: true },
                { key: 'calls', header: 'Calls', numeric: true },
              ]}
              empty="No one has taken a call on a draft scenario yet."
            />
          </div>
        </Section>
      </div>

      <Section title="Stats">
        <StatGroup label="Practice summary, last 30 days">
          <Stat label="Calls taken" value="72" note="12 more than last month" />
          <Stat label="Average score" value="79" note="out of 100" />
          <Stat label="Unsafe calls" value="3" note="2 people" />
          <Stat label="Staff who practised" value="9 of 14" />
        </StatGroup>
      </Section>

      <Section title="Empty state">
        <EmptyState
          title="No calls yet"
          action={
            <Button variant="go" size="large" href="/">
              Choose a call
            </Button>
          }
        >
          Your calls and scores will appear here after you finish your first practice call.
        </EmptyState>
      </Section>

      <Section title="Section navigation" description="Link-based tabs. Each item is its own page; the current one is marked for screen readers.">
        <SubNav
          label="Reports sections"
          current="/reports/people"
          items={[
            { href: '/reports', label: 'Overview' },
            { href: '/reports/people', label: 'People' },
            { href: '/reports/scenarios', label: 'Scenarios' },
            { href: '/reports/flags', label: 'Flagged debriefs' },
          ]}
        />
      </Section>

      <Section title="Copy field" description="For a one-time invitation link.">
        <CopyField
          label="Invitation link for Siobhan Kearney"
          hint="This link is shown once. It works for 7 days."
          value="https://practice-calls.example/invite/q7Xk2mP9vLw4RtNzB8cHdA3sYe5UfJ6g"
        />
      </Section>
    </AppShell>
  );
}
