import 'server-only';
import { headers } from 'next/headers';
import { ipFromHeaders } from '@/auth/client-ip';

/**
 * The caller's IP for throttling, or null (local development). Taken from the header the hosting
 * platform sets itself (`x-vercel-forwarded-for`, then `x-real-ip`), and only then from the first
 * `x-forwarded-for` entry, which a client can forge. See `ipFromHeaders`.
 */
export async function clientIp(): Promise<string | null> {
  return ipFromHeaders(await headers());
}
