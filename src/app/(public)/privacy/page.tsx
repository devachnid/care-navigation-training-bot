import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { PageHeader } from '@/ui';
import styles from './privacy.module.css';

export const metadata: Metadata = { title: 'Privacy notice' };

/** A statement the maintainer has not yet confirmed. Search the page for "[TO CONFIRM]". */
function Confirm({ children }: { children: ReactNode }) {
  return <span className={styles.confirm}>[TO CONFIRM] {children}</span>;
}

export default function PrivacyPage() {
  return (
    <>
      <PageHeader title="Privacy notice" lead="What this training tool keeps about you, who can see it, and who to ask about it." />
      <div className={styles.notice}>
        <section aria-labelledby="stored">
          <h2 id="stored">What is stored</h2>
          <ul>
            <li>Your name and work email address.</li>
            <li>A scrambled version of your password (a hash). Nobody can read your password.</li>
            <li>A text transcript of each practice call you make.</li>
            <li>The score and written feedback (the debrief) for each call, and any problem you report with a debrief.</li>
            <li>The time and length of each call, and when you sign in.</li>
          </ul>
          <p>
            <strong>Audio is never stored.</strong> Your voice is turned into text during the call, and only the text is kept.
          </p>
          <p>
            <strong>Never real patient information.</strong> The caller is simulated. Do not say any real patient&rsquo;s name, date of
            birth, NHS number or details on a call.
          </p>
          <p>
            The tool sets one cookie, to keep you signed in. It does not use analytics, advertising or third-party scripts.{' '}
            <Confirm>Check this is still true when you publish.</Confirm>
          </p>
        </section>

        <section aria-labelledby="who">
          <h2 id="who">Who can see it</h2>
          <ul>
            <li>You can see your own calls, transcripts and scores.</li>
            <li>Managers at your practice can see every practice call, transcript and score made in that practice, including yours.</li>
            <li>The administrator of the service can see data when they need to give support.</li>
          </ul>
          <p>Nobody at another practice can see your data.</p>
        </section>

        <section aria-labelledby="processors">
          <h2 id="processors">Who processes it for us</h2>
          <ul>
            <li>
              <strong>Vercel</strong> hosts the website, in London.
            </li>
            <li>
              <strong>Neon</strong> stores the database, in London.
            </li>
            <li>
              <strong>OpenAI</strong> provides the realtime voice model that plays the caller, and <strong>Anthropic</strong> provides the
              Claude model that writes your debrief. Both are reached through <strong>Vercel AI Gateway</strong>.
            </li>
          </ul>
          <p>
            This means the audio of your call, and then the text of the transcript, are sent to those providers so they can process them.
            Audio goes to the voice model during the call. The transcript goes to the debrief model afterwards.
          </p>
          <p>
            <Confirm>
              Where OpenAI, Anthropic and Vercel AI Gateway process data (inside or outside the UK), and whether they keep it or use it to
              train models.
            </Confirm>
          </p>
          <p>
            <Confirm>The name of the organisation that runs this service, and its contact address.</Confirm>
          </p>
        </section>

        <section aria-labelledby="responsible">
          <h2 id="responsible">Who is responsible for your data</h2>
          <p>
            Your practice is responsible for its staff&rsquo;s data in this tool. To see your data, or to ask for it to be deleted, ask your
            practice manager.
          </p>
          <p>
            <Confirm>
              That the practice is the data controller and the service is its processor, the legal basis for processing, and how a manager
              asks the administrator to delete data.
            </Confirm>
          </p>
        </section>

        <section aria-labelledby="keep">
          <h2 id="keep">How long it is kept</h2>
          <p>
            Your data is kept until your practice deletes it, or until your practice sets a retention period (a number of days after which
            transcripts are removed).
          </p>
          <p>
            <Confirm>
              Whether deleting after the retention period happens automatically yet, and how a practice deletes a person&rsquo;s data.
            </Confirm>
          </p>
        </section>

        <p>
          <Link href="/">Go to the home page</Link>
        </p>
      </div>
    </>
  );
}
