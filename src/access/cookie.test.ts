import { describe, expect, it } from 'vitest';
import { safeEqual, signTrainee, verifyTrainee } from './cookie';

describe('trainee cookie', () => {
  it('round-trips a name, including non-ASCII', () => {
    expect(verifyTrainee(signTrainee('Siân Llŷr', 'code'), 'code')).toBe('Siân Llŷr');
  });
  it('rejects a tampered name', () => {
    const [, sig] = signTrainee('Alice', 'code').split('.');
    const forged = `${Buffer.from('Bob').toString('base64url')}.${sig}`;
    expect(verifyTrainee(forged, 'code')).toBeNull();
  });
  it('rejects a cookie signed with a different access code', () => {
    expect(verifyTrainee(signTrainee('Alice', 'old'), 'new')).toBeNull();
  });
  it('rejects missing or malformed values', () => {
    expect(verifyTrainee(undefined, 'code')).toBeNull();
    expect(verifyTrainee('', 'code')).toBeNull();
    expect(verifyTrainee('abc', 'code')).toBeNull();
    expect(verifyTrainee('a.b.c', 'code')).toBeNull();
  });
  it('rejects everything when no secret is configured', () => {
    expect(verifyTrainee(signTrainee('Alice', ''), '')).toBeNull();
  });
  it('safeEqual compares strings', () => {
    expect(safeEqual('CODE-1', 'CODE-1')).toBe(true);
    expect(safeEqual('CODE-1', 'CODE-2')).toBe(false);
    expect(safeEqual('a', 'ab')).toBe(false);
  });
});
