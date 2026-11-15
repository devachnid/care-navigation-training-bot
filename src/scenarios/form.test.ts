import { describe, expect, it } from 'vitest';
import { fieldErrors, formValues, parseScenarioForm, rowsOf, valuesFromContent } from './form';
import { scenarios } from './seed';
import { scenarioContentSchema } from './types';

function toFormData(values: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.append(k, v);
  return fd;
}

const flashes = scenarios.find(s => s.id === 'flashes-floaters')!;

describe('scenario form', () => {
  it('round-trips a saved scenario through form values and back into valid content', () => {
    const fd = toFormData(valuesFromContent(flashes));
    const parsed = parseScenarioForm(fd);
    const result = scenarioContentSchema.safeParse(parsed.input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.persona).toEqual(flashes.persona);
      expect(result.data.hiddenFacts).toEqual(flashes.hiddenFacts);
      expect(result.data.redFlags).toEqual(flashes.redFlags);
      expect(result.data.unsafeOutcomes).toEqual(flashes.unsafeOutcomes);
    }
  });

  it('ignores fields it does not know and non-text values', () => {
    const fd = toFormData({ title: 'x', scenarioId: 'abc', revision: '3', 'hiddenFacts-0-fact': 'y', 'nonsense-1': 'z' });
    fd.append('title2', 'q');
    fd.append('openingLine', new Blob(['file']), 'file.txt');
    expect(formValues(fd)).toEqual({ title: 'x', 'hiddenFacts-0-fact': 'y' });
  });

  it('orders rows by number and copes with gaps', () => {
    const rows = rowsOf({ 'hiddenFacts-10-fact': 'a', 'hiddenFacts-2-unlockedBy': 'b', 'redFlags-5': 'c', 'redFlags-1': 'd' });
    expect(rows.hiddenFacts).toEqual([2, 10]);
    expect(rows.redFlags).toEqual([1, 5]);
    expect(rows.unsafeOutcomes).toEqual([]);
  });

  it('drops blank rows in plain lists but keeps blank fact rows', () => {
    const values = { ...valuesFromContent(flashes), 'redFlags-7': '   ', 'unsafeOutcomes-3': '', 'hiddenFacts-9-fact': '', 'hiddenFacts-9-unlockedBy': '' };
    const parsed = parseScenarioForm(toFormData(values));
    const input = parsed.input as { redFlags: string[]; unsafeOutcomes: string[]; hiddenFacts: unknown[] };
    expect(input.redFlags).toEqual(flashes.redFlags);
    expect(input.unsafeOutcomes).toEqual(flashes.unsafeOutcomes);
    expect(input.hiddenFacts).toHaveLength(flashes.hiddenFacts.length + 1);
  });

  it('reports a blank title and an empty fact row against the right fields', () => {
    const values = { ...valuesFromContent(flashes), title: '  ', 'hiddenFacts-1-fact': '' };
    const parsed = parseScenarioForm(toFormData(values));
    const result = scenarioContentSchema.safeParse(parsed.input);
    expect(result.success).toBe(false);
    if (result.success) return;
    const errors = fieldErrors(result.error, parsed);
    expect(errors.title).toBe('Enter a title.');
    expect(errors['hiddenFacts-1-fact']).toBe('Row 2 of what they only say if asked: enter the fact.');
    expect(Object.keys(errors)).toEqual(['title', 'hiddenFacts-1-fact']);
  });

  it('uses the row number as shown, not the identifier, when rows have gaps', () => {
    const base = valuesFromContent(flashes);
    const values: Record<string, string> = { ...base, 'hiddenFacts-20-fact': '', 'hiddenFacts-20-unlockedBy': 'asked' };
    const parsed = parseScenarioForm(toFormData(values));
    const result = scenarioContentSchema.safeParse(parsed.input);
    if (result.success) throw new Error('expected failure');
    const errors = fieldErrors(result.error, parsed);
    expect(errors['hiddenFacts-20-fact']).toMatch(/^Row 5 of/);
  });

  it('says what is wrong with the age', () => {
    const run = (age: string) => {
      const parsed = parseScenarioForm(toFormData({ ...valuesFromContent(flashes), personaAge: age }));
      const r = scenarioContentSchema.safeParse(parsed.input);
      if (r.success) throw new Error('expected failure');
      return fieldErrors(r.error, parsed).personaAge;
    };
    expect(run('')).toMatch(/^Enter the caller's age/);
    expect(run('abc')).toMatch(/as a number/);
    expect(run('7')).toMatch(/between 16 and 110/);
    expect(run('50.5')).toMatch(/between 16 and 110/);
  });

  it('asks for at least one fact when there are no rows, and flags a too-long list item', () => {
    const values = valuesFromContent(flashes);
    for (const k of Object.keys(values)) if (k.startsWith('hiddenFacts-')) delete values[k];
    values['redFlags-0'] = 'x'.repeat(1001);
    const parsed = parseScenarioForm(toFormData(values));
    const r = scenarioContentSchema.safeParse(parsed.input);
    if (r.success) throw new Error('expected failure');
    const errors = fieldErrors(r.error, parsed);
    expect(errors.hiddenFacts).toBe('Add at least one thing the caller only says if asked.');
    expect(errors['redFlags-0']).toBe('Row 1 of red flags: this is too long. Use 1000 characters or fewer.');
  });

  it('refuses an unknown voice or difficulty with a choose message', () => {
    const parsed = parseScenarioForm(toFormData({ ...valuesFromContent(flashes), voice: 'robot', difficulty: '' }));
    const r = scenarioContentSchema.safeParse(parsed.input);
    if (r.success) throw new Error('expected failure');
    const errors = fieldErrors(r.error, parsed);
    expect(errors.voice).toBe('Choose a voice.');
    expect(errors.difficulty).toBe('Choose a difficulty.');
  });
});
