import { describe, expect, it } from 'vitest';
import { safeEqual } from './safe-equal';

describe('safeEqual', () => {
  it('compares strings exactly', () => {
    expect(safeEqual('CODE-1', 'CODE-1')).toBe(true);
    expect(safeEqual('CODE-1', 'CODE-2')).toBe(false);
    expect(safeEqual('a', 'ab')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
  });
});
