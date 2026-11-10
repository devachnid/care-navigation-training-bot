export type Speaker = 'trainee' | 'patient';
export type Turn = { speaker: Speaker; text: string; sequence: number };

/**
 * Builds the transcript from realtime events.
 *
 * The trainee's speech is transcribed separately from the conversation, so its text
 * often arrives after the caller has already replied. Order is therefore fixed by when
 * each conversation item first appears, and text is filled in whenever it turns up.
 */
export class TranscriptAssembler {
  private items = new Map<string, { speaker: Speaker; text: string | null }>();

  /** Reserve this item's place in the conversation. Safe to call more than once. */
  itemAdded(itemId: string, speaker: Speaker): void {
    if (!this.items.has(itemId)) this.items.set(itemId, { speaker, text: null });
  }

  setText(itemId: string, speaker: Speaker, text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    const existing = this.items.get(itemId);
    if (existing) existing.text = trimmed;
    else this.items.set(itemId, { speaker, text: trimmed });
  }

  /** True while an item from this speaker is still waiting for its text. */
  hasPending(speaker: Speaker): boolean {
    for (const item of this.items.values()) if (item.speaker === speaker && item.text === null) return true;
    return false;
  }

  turns(): Turn[] {
    const out: Turn[] = [];
    for (const item of this.items.values()) {
      if (item.text) out.push({ speaker: item.speaker, text: item.text, sequence: out.length });
    }
    return out;
  }
}
