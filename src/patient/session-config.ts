import type { Scenario } from '@/scenarios/types';
import { buildPatientPrompt } from './prompt';

export type TurnDetection = {
  type: 'server-vad' | 'semantic-vad';
  threshold?: number;
  silenceDurationMs?: number;
  prefixPaddingMs?: number;
};

/**
 * How the voice model decides the receptionist has finished speaking.
 * 'semantic-vad' judges from the words whether the sentence is finished, so the caller does not
 * cut in during a mid-sentence pause. 'server-vad' replies after any short silence and did cut in.
 */
export const DEFAULT_TURN_DETECTION: TurnDetection = { type: 'semantic-vad' };

function turnDetection(): TurnDetection {
  const raw = process.env.REALTIME_TURN_DETECTION;
  if (!raw) return DEFAULT_TURN_DETECTION;
  try {
    return JSON.parse(raw);
  } catch {
    console.warn('REALTIME_TURN_DETECTION is not valid JSON; using the default');
    return DEFAULT_TURN_DETECTION;
  }
}

export type PatientSessionConfig = {
  instructions: string;
  voice: string;
  inputAudioTranscription: Record<string, never>;
  outputAudioTranscription: Record<string, never>;
  turnDetection: TurnDetection;
  providerOptions?: Record<string, unknown>;
};

/**
 * Realtime session settings for the caller. Sent to the browser, which opens the voice
 * connection, so it must never contain the answer key (buildPatientPrompt guarantees that).
 */
export function buildSessionConfig(scenario: Scenario): PatientSessionConfig {
  const config: PatientSessionConfig = {
    instructions: buildPatientPrompt(scenario),
    voice: scenario.voice,
    // Both sides are transcribed so the debrief can quote them.
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    turnDetection: turnDetection(),
  };
  // Optional pass-through for provider settings such as reasoning effort, as JSON.
  const raw = process.env.REALTIME_PROVIDER_OPTIONS;
  if (raw) {
    try {
      config.providerOptions = JSON.parse(raw);
    } catch {
      console.warn('REALTIME_PROVIDER_OPTIONS is not valid JSON; ignoring it');
    }
  }
  return config;
}
