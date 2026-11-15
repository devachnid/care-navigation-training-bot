import Link from 'next/link';
import { Checkbox } from '@/ui';

/** The "I have read the privacy notice" tick box used by setup and invitations. Field name: `privacy`. */
export function PrivacyCheckbox({ error }: { error?: string }) {
  return (
    <Checkbox
      name="privacy"
      error={error}
      label={
        <>
          I have read the{' '}
          <Link href="/privacy" target="_blank">
            privacy notice (opens in a new tab)
          </Link>
        </>
      }
    />
  );
}
