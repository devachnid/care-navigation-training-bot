import { describe, expect, it } from 'vitest';
import { TranscriptAssembler } from './transcript';

describe('TranscriptAssembler', () => {
  it('orders by item arrival, not by when text arrives', () => {
    const t = new TranscriptAssembler();
    t.itemAdded('p1', 'patient');
    t.setText('p1', 'patient', 'Hello, is that the surgery?');
    t.itemAdded('t1', 'trainee');
    t.itemAdded('p2', 'patient');
    t.setText('p2', 'patient', "It's my throat.");
    t.setText('t1', 'trainee', 'Yes, how can I help?');
    expect(t.turns()).toEqual([
      { speaker: 'patient', text: 'Hello, is that the surgery?', sequence: 0 },
      { speaker: 'trainee', text: 'Yes, how can I help?', sequence: 1 },
      { speaker: 'patient', text: "It's my throat.", sequence: 2 },
    ]);
  });
  it('drops items that never got text and renumbers', () => {
    const t = new TranscriptAssembler();
    t.itemAdded('t1', 'trainee');
    t.itemAdded('p1', 'patient');
    t.setText('p1', 'patient', 'Hello?');
    expect(t.turns()).toEqual([{ speaker: 'patient', text: 'Hello?', sequence: 0 }]);
  });
  it('accepts text for an item it has not seen, appending it', () => {
    const t = new TranscriptAssembler();
    t.setText('p1', 'patient', 'Hello?');
    expect(t.turns()).toHaveLength(1);
  });
  it('ignores whitespace-only text', () => {
    const t = new TranscriptAssembler();
    t.setText('t1', 'trainee', '   ');
    expect(t.turns()).toEqual([]);
  });
  it('keeps the first speaker when an item is announced twice', () => {
    const t = new TranscriptAssembler();
    t.itemAdded('x', 'trainee');
    t.itemAdded('x', 'patient');
    t.setText('x', 'patient', 'hi');
    expect(t.turns()[0].speaker).toBe('trainee');
  });
  it('reports pending trainee transcriptions', () => {
    const t = new TranscriptAssembler();
    t.itemAdded('t1', 'trainee');
    expect(t.hasPending('trainee')).toBe(true);
    t.setText('t1', 'trainee', 'Hello');
    expect(t.hasPending('trainee')).toBe(false);
  });
});
