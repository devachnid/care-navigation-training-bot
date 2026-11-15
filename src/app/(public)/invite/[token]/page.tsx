import type { Metadata } from 'next';
import { lookupInvitation } from '@/auth/invitations';
import { Alert, PageHeader } from '@/ui';
import { InviteForm } from './invite-form';

export const metadata: Metadata = { title: 'Your invitation', robots: { index: false, follow: false } };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const details = await lookupInvitation(token);

  if (!details) {
    return (
      <>
        <PageHeader title="This link cannot be used" />
        <Alert tone="warning" title="It may have expired, been used already or been cancelled.">
          Ask your practice manager for a new link.
        </Alert>
      </>
    );
  }

  if (details.kind === 'reset') {
    return (
      <>
        <PageHeader title="Choose a new password" lead={`For ${details.email}.`} />
        <InviteForm
          token={token}
          kind="reset"
          name={details.name}
          email={details.email}
          practiceName={null}
          needsPrivacyAck={details.needsPrivacyAck}
        />
      </>
    );
  }

  if (details.existingAccount) {
    return (
      <>
        <PageHeader
          eyebrow={details.practiceName}
          title={`Join ${details.practiceName ?? 'the practice'}`}
          lead={`You already have an account for ${details.email}. Enter your password to join ${details.practiceName ?? 'the practice'}.`}
        />
        <InviteForm
          token={token}
          kind="invite"
          name={details.name}
          email={details.email}
          practiceName={details.practiceName}
          needsPrivacyAck={details.needsPrivacyAck}
          existingAccount
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={details.practiceName}
        title="Create your account"
        lead={`${details.practiceName ?? 'Your practice'} has invited you to practise care navigation calls.`}
      />
      <InviteForm
        token={token}
        kind="invite"
        name={details.name}
        email={details.email}
        practiceName={details.practiceName}
        needsPrivacyAck={details.needsPrivacyAck}
      />
    </>
  );
}
