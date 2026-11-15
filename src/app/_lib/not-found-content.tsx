import { Button, PageHeader } from '@/ui';

/** Shared by the root and (app) `not-found.tsx`. Says the same thing whether the page is missing or not yours. */
export function NotFoundContent() {
  return (
    <>
      <PageHeader
        title="We cannot find that page"
        lead="The address may be wrong, or the page may have been removed. If you followed a link, ask whoever sent it to check it."
      />
      <Button href="/" size="large">
        Go to the home page
      </Button>
    </>
  );
}
