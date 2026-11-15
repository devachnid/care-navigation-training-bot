import type { Metadata } from 'next';
import { requireActor } from '@/auth/current';
import { listMyPractices } from '@/practices/dal';
import { Button, Card, PageHeader, Section, Tag, VisuallyHidden } from '@/ui';
import { switchPracticeAction } from './actions';
import styles from './account.module.css';
import { PasswordForm } from './password-form';

export const metadata: Metadata = { title: 'My account' };

export default async function AccountPage() {
  const actor = await requireActor();
  const mine = await listMyPractices(actor);

  return (
    <>
      <PageHeader title="My account" />
      <Section title="Your details">
        <dl className={styles.details}>
          <dt>Name</dt>
          <dd>{actor.name}</dd>
          <dt>Email</dt>
          <dd>{actor.email}</dd>
        </dl>
      </Section>

      {mine.length > 1 && (
        <Section title="Your practices" description="You are in more than one practice. You can only act in one at a time.">
          <ul className={styles.practices}>
            {mine.map(p => (
              <li key={p.practiceId}>
                <Card className={styles.practice}>
                  <p className={styles.practiceName}>
                    {p.practiceName}
                    <span className={styles.role}>{p.role === 'manager' ? 'Manager' : 'Trainee'}</span>
                  </p>
                  {p.current ? (
                    <Tag tone="approved">Current practice</Tag>
                  ) : (
                    <form action={switchPracticeAction}>
                      <input type="hidden" name="practiceId" value={p.practiceId} />
                      <Button type="submit" variant="secondary">
                        Switch<VisuallyHidden> to {p.practiceName}</VisuallyHidden>
                      </Button>
                    </form>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Change your password" description="You will stay signed in here, and be signed out on any other device.">
        <PasswordForm />
      </Section>
    </>
  );
}
