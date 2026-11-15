'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { describeLimit, formatClock } from '@/call/limit';
import { useCall, type CallError } from '@/call/use-call';
import type { PatientSessionConfig } from '@/patient/session-config';
import { Alert, Button, PageHeader } from '@/ui';
import styles from './call-screen.module.css';

const ERRORS: Record<CallError, string> = {
  'mic-denied':
    'The microphone is blocked. Click the padlock or microphone icon in the address bar, allow the microphone for this site, then try again.',
  'mic-missing': 'No microphone was found. Plug in your headset, then try again.',
  'connect-failed':
    'The call could not connect. Check your internet connection and try again. If it keeps happening, tell your practice manager.',
  dropped: 'The call dropped. Your conversation so far has been saved.',
};

type Props = {
  sessionId: string;
  title: string;
  modelId: string;
  maxSeconds: number;
  sessionConfig: PatientSessionConfig;
};

export function CallScreen(props: Props) {
  const { sessionId, title, maxSeconds } = props;
  const call = useCall(props);
  const router = useRouter();

  const debriefUrl = `/debrief/${sessionId}`;
  const finishedCleanly = call.phase === 'ended' && call.error !== 'dropped';
  useEffect(() => {
    if (finishedCleanly) router.replace(debriefUrl);
  }, [finishedCleanly, router, debriefUrl]);

  const inCall = call.phase === 'listening' || call.phase === 'speaking';
  const limitText = describeLimit(maxSeconds);

  return (
    <>
      <PageHeader eyebrow="Practice call" title={title} />

      {call.phase === 'idle' && (
        <>
          <p className={styles.lead}>
            Put your headset on. When you start, a caller will ring the surgery and speak first. Handle the call as you would at the desk,
            then hang up. The call ends by itself after {limitText}.
          </p>
          {call.error && (
            <div className={styles.alert}>
              <Alert tone="error">{ERRORS[call.error]}</Alert>
            </div>
          )}
          <div className={styles.actions}>
            <Button variant="go" size="large" onClick={call.start}>
              {call.error ? 'Try again' : 'Start call'}
            </Button>
            <Link href="/">Back to scenarios</Link>
          </div>
        </>
      )}

      {call.phase === 'connecting' && (
        <p className={styles.status} role="status">
          Connecting…
        </p>
      )}

      {inCall && (
        <>
          <p className={`${styles.status} ${call.phase === 'speaking' ? styles.speaking : styles.listening}`} role="status">
            {call.phase === 'speaking' ? 'Caller speaking' : 'Listening'}
          </p>
          <p className={styles.timer} aria-label="Call time">
            {formatClock(call.elapsedSeconds)}
          </p>
          {call.nearLimit && (
            <div className={styles.warning}>
              <Alert tone="warning" role="status" title="About one minute left">
                The call ends by itself at the {limitText} limit. Start wrapping up.
              </Alert>
            </div>
          )}
          <Button variant="danger" size="large" onClick={call.hangUp}>
            Hang up
          </Button>
        </>
      )}

      {(call.phase === 'ending' || finishedCleanly) && (
        <>
          {call.endedAtLimit && (
            <div className={styles.warning}>
              <Alert tone="info" role="status">
                The call reached the {limitText} limit and was ended.
              </Alert>
            </div>
          )}
          <p className={styles.status} role="status">
            Preparing your debrief…
            <span className={styles.hint}>This can take up to a minute.</span>
          </p>
        </>
      )}

      {call.phase === 'ended' && call.error === 'dropped' && (
        <>
          <div className={styles.alert}>
            <Alert tone="error">{ERRORS.dropped}</Alert>
          </div>
          <div className={styles.actions}>
            <Button href={debriefUrl}>See the debrief</Button>
            <Link href="/">Back to scenarios</Link>
          </div>
        </>
      )}
    </>
  );
}
