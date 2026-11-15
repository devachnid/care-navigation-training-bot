/**
 * For the JSON route handlers (server actions are origin-checked by Next): true only when the
 * request's `Origin` header names the same host the request was sent to. A missing Origin is
 * refused, since every browser sends it on a cross-origin-capable POST.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
