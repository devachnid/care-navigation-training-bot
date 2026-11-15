import { createHash, randomBytes } from 'node:crypto';

/** A 32-byte random token, base64url (43 characters). Sent to the browser or put in a link; never stored. */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/** What is stored in place of a token: SHA-256, hex. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Cheap shape check so junk never reaches the database. */
export function isWellFormedToken(token: string | null | undefined): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}
