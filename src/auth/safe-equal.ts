import { createHash, timingSafeEqual } from 'node:crypto';

/** Constant-time string comparison (hashes first so different lengths take the same time). */
export function safeEqual(a: string, b: string): boolean {
  const x = createHash('sha256').update(a).digest();
  const y = createHash('sha256').update(b).digest();
  return timingSafeEqual(x, y) && a === b;
}
