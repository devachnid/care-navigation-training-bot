import { describe, expect, it } from 'vitest';
import { keepVerifiedQuotes } from './quotes';

const lines = ["Hello, is that the surgery?", "I've used  quite a lot of it, to be honest."];
const p = (quote: string) => ({ point: 'x', quote });

describe('keepVerifiedQuotes', () => {
  it('keeps exact and partial quotes', () => {
    expect(keepVerifiedQuotes([p('Hello, is that the surgery?'), p('quite a lot of it')], lines)).toHaveLength(2);
  });
  it('ignores case, spacing, quote marks and trailing ellipsis', () => {
    expect(keepVerifiedQuotes([p('"i’ve used quite a lot of it..."')], lines)).toHaveLength(1);
  });
  it('drops quotes that are not in the transcript', () => {
    expect(keepVerifiedQuotes([p('I have chest pain'), p('')], lines)).toEqual([]);
  });
});
