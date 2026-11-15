import { describe, expect, it } from 'vitest';
import { RUBRIC } from '@/debrief/rubric';
import type { ExportRow } from './dal';
import { EXPORT_HEADER, exportCells, exportCsv, exportFilename, exportResult, londonDate, londonTime } from './export';

const row = (over: Partial<ExportRow> = {}): ExportRow => ({
  sessionId: 's1',
  startedAt: new Date('2026-11-12T14:05:30Z'),
  name: 'Ann Adams',
  email: 'ann@example.test',
  title: 'Chest pain',
  difficulty: 'hard',
  approved: true,
  durationSeconds: 140,
  status: 'complete',
  score: 71,
  outcomeCorrect: true,
  unsafeOutcome: false,
  redFlagHandled: true,
  rubricScores: {
    greeting: { score: 2, justification: '' },
    information: { score: 1, justification: '' },
    redFlag: { score: 2, justification: '' },
    destination: { score: 2, justification: '' },
    role: { score: 0, justification: '' },
    explanation: { score: 1, justification: '' },
    manner: { score: 2, justification: '' },
  },
  ...over,
});

describe('London date and time', () => {
  it('uses UTC in winter and BST in summer', () => {
    expect(londonDate(new Date('2026-11-12T14:05:00Z'))).toBe('2026-11-12');
    expect(londonTime(new Date('2026-11-12T14:05:00Z'))).toBe('14:05');
    expect(londonTime(new Date('2026-07-01T14:05:00Z'))).toBe('15:05');
  });

  it('rolls the date over at London midnight, not UTC midnight', () => {
    expect(londonDate(new Date('2026-07-01T23:30:00Z'))).toBe('2026-07-02');
    expect(londonTime(new Date('2026-07-01T23:30:00Z'))).toBe('00:30');
    expect(londonTime(new Date('2026-11-12T00:05:00Z'))).toBe('00:05');
  });
});

describe('exportResult', () => {
  it('names the four results', () => {
    expect(
      exportResult({
        status: 'complete',
        outcomeCorrect: true,
        unsafeOutcome: false,
      }),
    ).toBe('Passed');
    expect(
      exportResult({
        status: 'complete',
        outcomeCorrect: false,
        unsafeOutcome: false,
      }),
    ).toBe('Not yet');
    expect(
      exportResult({
        status: 'complete',
        outcomeCorrect: true,
        unsafeOutcome: true,
      }),
    ).toBe('Unsafe');
    expect(
      exportResult({
        status: 'too_short',
        outcomeCorrect: false,
        unsafeOutcome: false,
      }),
    ).toBe('Too short');
  });
});

describe('exportCells', () => {
  it('has one cell per header, with one rubric column per rubric item', () => {
    expect(EXPORT_HEADER).toHaveLength(13 + RUBRIC.length);
    expect(EXPORT_HEADER.slice(13)).toEqual(RUBRIC.map(r => r.label));
    expect(exportCells(row())).toHaveLength(EXPORT_HEADER.length);
  });

  it('formats a full row', () => {
    expect(exportCells(row())).toEqual([
      '2026-11-12',
      '14:05',
      'Ann Adams',
      'ann@example.test',
      'Chest pain',
      'Hard',
      'No',
      140,
      'Passed',
      71,
      'Yes',
      'No',
      'Yes',
      2,
      1,
      2,
      2,
      0,
      1,
      2,
    ]);
  });

  it('marks a draft scenario and says "Not applicable" when there is no red flag', () => {
    const cells = exportCells(row({ approved: false, redFlagHandled: null }));
    expect(cells[6]).toBe('Yes');
    expect(cells[12]).toBe('Not applicable');
  });

  it('says "No" when a red flag was missed and leaves a rubric item blank when it did not apply', () => {
    const base = row();
    const cells = exportCells(
      row({
        redFlagHandled: false,
        rubricScores: { ...base.rubricScores!, redFlag: null },
      }),
    );
    expect(cells[12]).toBe('No');
    expect(cells[13 + RUBRIC.findIndex(r => r.key === 'redFlag')]).toBeNull();
  });

  it('leaves every rubric column blank for a call that was too short', () => {
    const cells = exportCells(
      row({
        status: 'too_short',
        score: 0,
        outcomeCorrect: false,
        redFlagHandled: null,
        rubricScores: null,
        durationSeconds: 5,
      }),
    );
    expect(cells.slice(8, 13)).toEqual(['Too short', 0, 'No', 'No', 'Not applicable']);
    expect(cells.slice(13).every(c => c === null)).toBe(true);
  });

  it('writes a missing length as blank', () => {
    expect(exportCells(row({ durationSeconds: null }))[7]).toBeNull();
  });
});

describe('exportCsv', () => {
  it('neutralises a staff name that starts with =', () => {
    const csv = exportCsv([row({ name: '=HYPERLINK("http://evil.example","x")' })]);
    expect(csv).toContain(`"'=HYPERLINK(""http://evil.example"",""x"")"`);
    expect(csv.split('\r\n')[1].split(',')[2].startsWith(`"'=`)).toBe(true);
  });

  it('has a header row and a row per call', () => {
    const lines = exportCsv([row(), row({ sessionId: 's2' })]).split('\r\n');
    expect(lines).toHaveLength(4); // header, two rows, and the empty piece after the final CRLF
    expect(lines[0]).toContain('Date,Time (Europe/London),Name,Email');
  });
});

describe('exportFilename', () => {
  const now = new Date('2026-11-15T12:00:00Z');
  it('uses the practice name and the London date', () => {
    expect(exportFilename('Ty Gwyn Surgery', now)).toBe('call-practice-ty-gwyn-surgery-2026-11-15.csv');
  });
  it('removes accents, punctuation and odd characters', () => {
    expect(exportFilename('  St. Mary’s / Café "Health" Centre!  ', now)).toBe('call-practice-st-mary-s-cafe-health-centre-2026-11-15.csv');
    expect(exportFilename('../../etc"\r\nX', now)).toBe('call-practice-etc-x-2026-11-15.csv');
  });
  it('has a fallback when the name has no usable letters', () => {
    expect(exportFilename('日本語', now)).toBe('call-practice-practice-2026-11-15.csv');
  });
});
