import type { Scenario } from '@/scenarios/types';
import { buildPatientPrompt } from './prompt';

export type PatientSessionConfig = {
  instructions: string;
  voice: string;
  inputAudioTranscription: Record<string, never>;
  outputAudioTranscription: Record<string, never>;
  turnDetection: { type: 'server-vad' };
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
    turnDetection: { type: 'server-vad' },
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
