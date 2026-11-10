'use client';

import { experimental_useRealtime as useRealtime } from '@ai-sdk/react';
import { gateway } from 'ai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PatientSessionConfig } from '@/patient/session-config';
import { TranscriptAssembler } from './transcript';

export type CallPhase = 'idle' | 'connecting' | 'listening' | 'speaking' | 'ending' | 'ended';
type Stage = 'idle' | 'active' | 'ending' | 'ended';
export type CallError = 'mic-denied' | 'mic-missing' | 'connect-failed' | 'dropped';
export type CallResult = { status: string } | null;

/** How long to wait at hang-up for the last of the trainee's words to be transcribed. */
const TRANSCRIPT_GRACE_MS = 1500;

function roleOf(item: unknown): 'trainee' | 'patient' | null {
  const role = (item as { role?: unknown } | null)?.role;
  if (role === 'user') return 'trainee';
  if (role === 'assistant') return 'patient';
  return null;
}

/**
 * Runs one training call: microphone, voice connection, transcript capture and hang-up.
 * Audio goes straight between the browser and the voice model; only text is kept.
 */
export function useCall(opts: { sessionId: string; modelId: string; sessionConfig: PatientSessionConfig }) {
  const { sessionId, modelId, sessionConfig } = opts;
  // The hook restarts its session if these change identity, so keep them stable.
  const model = useMemo(() => gateway.experimental_realtime(modelId), [modelId]);
  const config = useMemo(() => sessionConfig, [sessionConfig]);

  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<CallError | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [result, setResult] = useState<CallResult>(null);

  const transcript = useRef(new TranscriptAssembler());
  const patientDeltas = useRef(new Map<string, string>());
  const stream = useRef<MediaStream | null>(null);
  const startedAt = useRef<number | null>(null);
  const openingRequested = useRef(false);
  const finishing = useRef(false);

  const rt = useRealtime({
    model,
    api: { token: `/api/sessions/${sessionId}/token` },
    sessionConfig: config,
    onEvent: event => {
      const t = transcript.current;
      switch (event.type) {
        case 'audio-committed':
          // The trainee finished speaking: hold their place before the caller replies.
          if (event.itemId) t.itemAdded(event.itemId, 'trainee');
          break;
        case 'conversation-item-added': {
          const speaker = roleOf(event.item);
          if (speaker) t.itemAdded(event.itemId, speaker);
          break;
        }
        case 'input-transcription-completed':
          t.setText(event.itemId, 'trainee', event.transcript);
          break;
        case 'audio-transcript-delta': {
          t.itemAdded(event.itemId, 'patient');
          const soFar = (patientDeltas.current.get(event.itemId) ?? '') + event.delta;
          patientDeltas.current.set(event.itemId, soFar);
          // Kept up to date so a caller cut off mid-sentence is still recorded.
          t.setText(event.itemId, 'patient', soFar);
          break;
        }
        case 'audio-transcript-done':
          t.setText(event.itemId, 'patient', event.transcript ?? patientDeltas.current.get(event.itemId) ?? '');
          break;
      }
    },
    onError: err => console.error('Realtime error', err),
  });

  const releaseMic = useCallback(() => {
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
  }, []);

  /** Saves the transcript and asks the server for the debrief. */
  const finish = useCallback(
    async (dropped: boolean) => {
      if (finishing.current) return;
      finishing.current = true;
      await Promise.resolve();
      setStage('ending');
      if (dropped) setError('dropped');
      else {
        const deadline = Date.now() + TRANSCRIPT_GRACE_MS;
        while (transcript.current.hasPending('trainee') && Date.now() < deadline) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      try {
        rt.stopAudioCapture();
        rt.disconnect();
      } catch {
        // Already disconnected.
      }
      releaseMic();
      const durationSeconds = startedAt.current ? (Date.now() - startedAt.current) / 1000 : 0;
      try {
        const res = await fetch(`/api/sessions/${sessionId}/end`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            durationSeconds,
            turns: transcript.current.turns().map(({ speaker, text }) => ({ speaker, text: text.slice(0, 4000) })),
          }),
        });
        setResult(res.ok ? await res.json() : { status: 'failed' });
      } catch {
        setResult({ status: 'failed' });
      }
      setStage('ended');
    },
    [rt, releaseMic, sessionId],
  );

  const failToConnect = useCallback(async () => {
    await Promise.resolve();
    releaseMic();
    setError('connect-failed');
    setStage('idle');
  }, [releaseMic]);

  const start = useCallback(async () => {
    setError(null);
    setStage('active');
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (err) {
      const name = (err as DOMException)?.name;
      setError(name === 'NotFoundError' || name === 'OverconstrainedError' ? 'mic-missing' : 'mic-denied');
      setStage('idle');
      return;
    }
    try {
      await rt.connect();
    } catch {
      failToConnect();
    }
  }, [rt, failToConnect]);

  const connected = rt.status === 'connected';
  const phase: CallPhase =
    stage === 'active' ? (connected ? (rt.isPlaying ? 'speaking' : 'listening') : 'connecting') : stage;

  // React to the connection coming up or going away.
  useEffect(() => {
    if (stage !== 'active') return;
    if (rt.status === 'connected' && !openingRequested.current) {
      openingRequested.current = true;
      startedAt.current = Date.now();
      if (stream.current) rt.startAudioCapture(stream.current);
      // The caller speaks first, as on a real phone call.
      rt.requestResponse();
    } else if (rt.status === 'error' || (rt.status === 'disconnected' && openingRequested.current)) {
      if (openingRequested.current) void finish(true);
      else void failToConnect();
    }
  }, [stage, rt.status, rt, finish, failToConnect]);

  // Call timer.
  useEffect(() => {
    if (!(stage === 'active' && connected)) return;
    const id = setInterval(() => {
      if (startedAt.current) setElapsedSeconds(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 500);
    return () => clearInterval(id);
  }, [stage, connected]);

  // Never leave the microphone open after leaving the page.
  useEffect(() => releaseMic, [releaseMic]);

  return { phase, error, elapsedSeconds, result, start, hangUp: () => finish(false) };
}
