import { afterEach, describe, expect, it, vi } from 'vitest';
import { scenarios } from '@/scenarios/seed';
import { buildSessionConfig } from './session-config';

const scenario = scenarios.find(s => s.id === 'sore-throat')!;

describe('buildSessionConfig', () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses the scenario's voice and transcribes both sides", () => {
    const c = buildSessionConfig(scenario);
    expect(c.voice).toBe('coral');
    expect(c.inputAudioTranscription).toEqual({});
    expect(c.outputAudioTranscription).toEqual({});
  });
  it('waits for the receptionist to finish their sentence by default', () => {
    expect(buildSessionConfig(scenario).turnDetection).toEqual({ type: 'semantic-vad' });
  });
  it('lets turn detection be overridden, and ignores a broken override', () => {
    vi.stubEnv('REALTIME_TURN_DETECTION', '{"type":"server-vad","silenceDurationMs":900}');
    expect(buildSessionConfig(scenario).turnDetection).toEqual({ type: 'server-vad', silenceDurationMs: 900 });
    vi.stubEnv('REALTIME_TURN_DETECTION', 'not json');
    expect(buildSessionConfig(scenario).turnDetection).toEqual({ type: 'semantic-vad' });
  });
});
