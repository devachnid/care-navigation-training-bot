import { describe, expect, it } from 'vitest';
import { scenarios } from '@/scenarios/seed';
import { buildPatientPrompt } from './prompt';

describe('buildPatientPrompt', () => {
  for (const s of scenarios) {
    describe(s.id, () => {
      const p = buildPatientPrompt(s);
      it('includes story, opening line, emotional state and every hidden fact with its unlock', () => {
        expect(p).toContain(s.presentingStory);
        expect(p).toContain(s.openingLine);
        expect(p).toContain(s.emotionalState);
        for (const h of s.hiddenFacts) {
          expect(p).toContain(h.fact);
          expect(p).toContain(h.unlockedBy);
        }
      });
      it('never leaks the answer key', () => {
        expect(p).not.toContain(s.correctOutcome);
        for (const u of s.unsafeOutcomes) expect(p).not.toContain(u);
        for (const a of s.acceptableAlternatives) expect(p).not.toContain(a);
        expect(p).not.toMatch(/999|pharmac|optometrist|duty clinician|111/i);
      });
      it('carries the fixed rules', () => {
        expect(p).toMatch(/Never say or hint that you are an AI, a simulation or part of training/);
        expect(p).toMatch(/South Wales/);
        expect(p).toMatch(/Never tell the receptionist what they should do/);
      });
    });
  }
});
