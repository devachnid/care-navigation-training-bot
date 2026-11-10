import { describe, expect, it } from 'vitest';
import { scenarios } from './seed';
import { scenarioSchema } from './types';

describe('seed scenarios', () => {
  it('has the four brief scenarios, all valid', () => {
    expect(scenarios.map(s => s.id)).toEqual(['sore-throat', 'flashes-floaters', 'angina-repeat', 'low-mood']);
    for (const s of scenarios) scenarioSchema.parse(s);
  });
  it('has unique ids', () => {
    expect(new Set(scenarios.map(s => s.id)).size).toBe(scenarios.length);
  });
  it('none are clinician approved yet', () => {
    expect(scenarios.every(s => s.clinicianApproved === false)).toBe(true);
  });
  it('hard scenarios define red flags and unsafe outcomes', () => {
    for (const id of ['angina-repeat', 'low-mood']) {
      const s = scenarios.find(x => x.id === id)!;
      expect(s.redFlags.length).toBeGreaterThan(0);
      expect(s.unsafeOutcomes.length).toBeGreaterThan(0);
    }
  });
  it('gives every caller a voice', () => {
    expect(Object.fromEntries(scenarios.map(s => [s.id, s.voice]))).toEqual({
      'sore-throat': 'coral',
      'flashes-floaters': 'coral',
      'angina-repeat': 'ballad',
      'low-mood': 'ballad',
    });
  });
  it('sore throat has no red flags', () => {
    expect(scenarios.find(s => s.id === 'sore-throat')!.redFlags).toEqual([]);
  });
});
