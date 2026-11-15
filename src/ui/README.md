# src/ui

Shared components. Import from `@/ui`. Each has a colocated CSS Module that reads only the tokens in `src/app/globals.css`. Server components unless marked (client). See every one live at `/styleguide` (development only).

| Component | Use it for | Usage |
|---|---|---|
| `AppShell` | Signed-in page frame: skip link, header, nav, `<main id="main">`, footer | `<AppShell userName practiceName nav signOutAction>{page}</AppShell>` |
| `PublicShell` | Signed-out pages: sign in, invitation, setup, privacy | `<PublicShell>{page}</PublicShell>` |
| `PageHeader` | The top of every page (the one `h1`) | `<PageHeader eyebrow="Team" title="Staff" lead="…" actions={<Button href="/team/invite">Invite</Button>} back={{ href: '/team', label: 'Back' }} />` |
| `Section` | A titled block of a page | `<Section title="Recent calls" description="…">…</Section>` |
| `Card` | One panel for one thing | `<Card title="Chest pain" actions={<Tag tone="hard">Hard</Tag>}>…</Card>` |
| `Button` | Any action or link that looks like one | `<Button variant="go" size="large" href="/call/1">Start the call</Button>` |
| `SubmitButton` (client) | Submit that shows a pending label | `<SubmitButton pendingLabel="Saving…">Save</SubmitButton>` |
| `ConfirmButton` (client) | Destructive action needing a second click, inside a `<form action>` | `<ConfirmButton label="Deactivate" question="They will not be able to sign in." name="userId" value={id} />` |
| `Field` | Labelled input, select or textarea with hint and error | `<Field label="Email" name="email" type="email" hint="…" error={errors.email} defaultValue={v.email} />` (`as="select"` or `as="textarea"` for the others). A `readOnly` field gets a dashed edge and "(cannot be changed)" in its label |
| `Checkbox` | One tick box | `<Checkbox name="approver" label="Can approve scenarios" />` |
| `RadioGroup` | Exclusive choices | `<RadioGroup legend="Role" name="role" options={[{ value: 'trainee', label: 'Trainee' }]} />` |
| `Fieldset` | Group related controls | `<Fieldset legend="Permissions">…</Fieldset>` |
| `ErrorSummary` (client) | List of form errors linking to fields; takes focus when shown | `<ErrorSummary errors={[{ message: 'Enter a name', href: '#name' }]} />` |
| `Alert` | Message on the page; `unsafe` for a call that put a patient at risk | `<Alert tone="warning" title="Draft">…</Alert>` |
| `Tag` | Short status or difficulty label | `<Tag tone="approved">Approved</Tag>` |
| `DataTable` | Accessible table; scrolls sideways in a focusable region | `<DataTable caption="Calls" columns={[{ key: 'name', header: 'Name', rowHeader: true }]} rows={rows} rowKey={r => r.id} empty="No calls yet." />` |
| `StatGroup` / `Stat` | Big numbers for dashboards | `<StatGroup label="Last 30 days"><Stat label="Calls" value="72" /></StatGroup>` |
| `EmptyState` | Instead of an empty list | `<EmptyState title="No calls yet" action={<Button href="/">Choose a call</Button>}>…</EmptyState>` |
| `SubNav` | Link tabs for sections of one area | `<SubNav label="Reports" items={[{ href: '/reports', label: 'Overview' }]} />` |
| `CopyField` (client) | One-time link with a Copy button | `<CopyField label="Invitation link" value={url} />` |
| `VisuallyHidden` | Text for screen readers only | `<VisuallyHidden>Error: </VisuallyHidden>` |

Rules: one `h1` per page (`PageHeader`). Tell people what went wrong and what to do. Colour is never the only signal. Controls are at least 44px tall. Do not add icon libraries, web fonts or external assets.
