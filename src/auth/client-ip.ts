/**
 * The caller's IP for throttling, from headers the hosting platform sets.
 *
 * Order matters: a client can send its own `X-Forwarded-For`, and proxies append to it, so its
 * first entry is whatever the client chose. On Vercel, `x-vercel-forwarded-for` and `x-real-ip`
 * are set by the platform from the connection itself and overwrite anything the client sent, so
 * they are preferred; the first `x-forwarded-for` entry is only a last resort for other hosts.
 * Null when none is present (local development); the throttle then keys on the email alone.
 */
export function ipFromHeaders(h: Headers): string | null {
  for (const name of ['x-vercel-forwarded-for', 'x-real-ip', 'x-forwarded-for']) {
    const first = h.get(name)?.split(',')[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  return null;
}
