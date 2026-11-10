'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useCall, type CallError } from '@/call/use-call';
import type { PatientSessionConfig } from '@/patient/session-config';

const ERRORS: Record<CallError, string> = {
  'mic-denied':
    'The microphone is blocked. Click the padlock or microphone icon in the address bar, allow the microphone for this site, then try again.',
  'mic-missing': 'No microphone was found. Plug in your headset, then try again.',
  'connect-failed': 'The call could not connect. Check your internet connection and try again. If it keeps happening, tell whoever runs this tool.',
  dropped: 'The call dropped. Your conversation so far has been saved.',
};

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function CallScreen(props: { sessionId: string; title: string; modelId: string; sessionConfig: PatientSessionConfig }) {
  const { sessionId, title } = props;
  const call = useCall(props);
  const router = useRouter();

  const debriefUrl = `/debrief/${sessionId}`;
  const finishedCleanly = call.phase === 'ended' && call.error !== 'dropped';
  useEffect(() => {
    if (finishedCleanly) router.replace(debriefUrl);
  }, [finishedCleanly, router, debriefUrl]);

  const inCall = call.phase === 'listening' || call.phase === 'speaking';

  return (
    <main className="call">
      <p className="eyebrow">Practice call</p>
      <h1>{title}</h1>

      {call.phase === 'idle' && (
        <>
          <p className="lead">
            Put your headset on. When you start, a caller will ring the surgery and speak first. Handle the call as you would at the desk, then hang
            up.
          </p>
          {call.error && (
            <p className="alert" role="alert">
              {ERRORS[call.error]}
            </p>
          )}
          <button className="button button-go" onClick={call.start}>
            {call.error ? 'Try again' : 'Start call'}
          </button>
          <p>
            <Link href="/">Back to scenarios</Link>
          </p>
        </>
      )}

      {call.phase === 'connecting' && (
        <p className="status" role="status">
          Connecting…
        </p>
      )}

      {inCall && (
        <>
          <p className={`status ${call.phase === 'speaking' ? 'status-speaking' : 'status-listening'}`} role="status">
            {call.phase === 'speaking' ? 'Caller speaking' : 'Listening'}
          </p>
          <p className="timer" aria-label="Call time">
            {clock(call.elapsedSeconds)}
          </p>
          <button className="button button-stop" onClick={call.hangUp}>
            Hang up
          </button>
        </>
      )}

      {(call.phase === 'ending' || finishedCleanly) && (
        <p className="status" role="status">
          Preparing your debrief…
          <span className="hint">This can take up to a minute.</span>
        </p>
      )}

      {call.phase === 'ended' && call.error === 'dropped' && (
        <>
          <p className="alert" role="alert">
            {ERRORS.dropped}
          </p>
          <p className="actions">
            <Link className="button" href={debriefUrl}>
              See the debrief
            </Link>
            <Link href="/">Back to scenarios</Link>
          </p>
        </>
      )}
    </main>
  );
}
