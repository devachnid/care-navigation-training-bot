import { createHmac, timingSafeEqual } from 'node:crypto';

export const TRAINEE_COOKIE = 'trainee';

const mac = (payload: string, secret: string) => createHmac('sha256', secret).update(payload).digest('base64url');

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Cookie value carrying the trainee's name, signed so it cannot be edited or forged without the access code. */
export function signTrainee(name: string, secret: string): string {
  const payload = Buffer.from(name, 'utf8').toString('base64url');
  return `${payload}.${mac(payload, secret)}`;
}

export function verifyTrainee(value: string | undefined, secret: string): string | null {
  if (!value || !secret) return null;
  const [payload, signature, ...rest] = value.split('.');
  if (!payload || !signature || rest.length) return null;
  if (!safeEqual(signature, mac(payload, secret))) return null;
  const name = Buffer.from(payload, 'base64url').toString('utf8');
  return name || null;
}
