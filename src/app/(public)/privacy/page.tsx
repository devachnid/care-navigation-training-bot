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
            <li>Which scenario you practised, the time and length of each call, and when you last signed in.</li>
            <li>When you accepted this notice.</li>
            <li>A record of changes to a practice&rsquo;s team, scenarios and settings: what was changed, by whom and when.</li>
            <li>
              Your network (IP) address, briefly. It is used only to count sign-in attempts so that guessing passwords can be slowed down.
              The counts last for 15-minute windows and are cleared automatically.
            </li>
          </ul>
          <p>
            <strong>Audio is never stored.</strong> Your voice is turned into text during the call, and only the text is kept.
          </p>
          <p>
            <strong>Never real patient information.</strong> The caller is simulated. Do not say any real patient&rsquo;s name, date of
            birth, NHS number or details on a call.
          </p>
          <p>
            The tool sets one cookie, to keep you signed in. It lasts 12 hours and is removed when you sign out. It does not use analytics,
            advertising, tracking or third-party scripts, and it loads no fonts, images or other files from other websites. During a call
            your browser connects to this site and to Vercel AI Gateway, and to nothing else.
          </p>
        </section>

        <section aria-labelledby="who">
          <h2 id="who">Who can see it</h2>
          <ul>
            <li>You can see your own calls, transcripts and scores.</li>
            <li>
              Managers at your practice can see every call, transcript, debrief and score made in that practice, including yours, and
              can download the practice&rsquo;s results as a spreadsheet with names and email addresses. They can also see when you last
              signed in.
            </li>
            <li>
              The administrator of the service cannot see the content of any call, transcript, debrief or score, and cannot see who made
              which call. They can see the names, email addresses, roles and last sign-in times of the people in each practice, and how many calls and
              minutes each practice has used.
            </li>
            <li>
              The administrator can make a link that lets you choose a new password if you are locked out. Your practice&rsquo;s
              &ldquo;Recent changes&rdquo; list shows when they do, and when the link is used.
            </li>
          </ul>
          <p>Nobody at another practice can see your data.</p>
          <p>
            The tool&rsquo;s pages work as described above. The people who run the hosting and the database accounts can technically
            reach what is stored.{' '}
            <Confirm>Who at the organisation has access to the database and the hosting accounts, and the rules they work under.</Confirm>
          </p>
        </section>

        <section aria-labelledby="processors">
          <h2 id="processors">Who processes it for us</h2>
          <ul>
            <li>
              <strong>Vercel</strong> hosts the website. Its server functions run in London.
            </li>
            <li>
              <strong>Neon</strong> stores the database.
            </li>
            <li>
              <strong>OpenAI</strong> provides the realtime voice model that plays the caller, and <strong>Anthropic</strong> provides the
              Claude model that writes your debrief. Both are reached through <strong>Vercel AI Gateway</strong>.
            </li>
          </ul>
          <p>
            This means the audio of your call, and then the text of the transcript, are sent to those providers so they can process them.
            Audio goes from your browser to the voice model during the call, and the voice model also turns it into text. The transcript
            and the scenario&rsquo;s answer key go to the debrief model afterwards. The service does not keep the audio.
          </p>
          <p>
            <Confirm>
              Where Neon stores the database, where OpenAI, Anthropic and Vercel AI Gateway process data (inside or outside the UK), and
              whether they keep it or use it to train models.
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
            practice manager. Managers can read your calls, but the tool has no button to delete one person&rsquo;s data or one call: the
            only deletion it does itself is the automatic one described below.
          </p>
          <p>
            <Confirm>
              That the practice is the data controller and the service is its processor, the legal basis for processing, and how a manager
              asks the administrator to delete a person&rsquo;s data.
            </Confirm>
          </p>
        </section>

        <section aria-labelledby="keep">
          <h2 id="keep">How long it is kept</h2>
          <p>
            Each practice chooses how long transcripts are kept: until they are deleted, or 90 days, 180 days, 1 year or 2 years. If a
            practice has chosen a period, a job runs every day and, for calls that ended longer ago than that, deletes the transcript, the
            quoted lines and written feedback in the debrief, and any problem report about that debrief. Once deleted they cannot be
            brought back.
          </p>
          <p>
            Everything else is kept until it is removed by hand: your account, the scores and the one-line reasons behind them, which
            scenario you practised and when, and the record of changes to the practice. A transcript is kept for as long as the practice
            has not chosen a period.
          </p>
        </section>

        <p>
          <Link href="/">Go to the home page</Link>
        </p>
      </div>
    </>
  );
}
