import 'server-only';
import { headers } from 'next/headers';

/** The caller's IP: the first entry of `x-forwarded-for` (set by Vercel), or null (local development). */
export async function clientIp(): Promise<string | null> {
  const first = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim();
  return first ? first.slice(0, 64) : null;
}
