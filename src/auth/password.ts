import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

function scrypt(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password.normalize('NFC'), salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

const options = (n: number, r: number, p: number): ScryptOptions => ({ N: n, r, p, maxmem: 128 * n * r * p + 1024 * 1024 });

/** `scrypt$N$r$p$salt$hash`, salt and hash in base64, so the parameters can change later. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scrypt(password, salt, KEY_LENGTH, options(N, R, P));
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

const isPowerOfTwo = (n: number) => Number.isInteger(n) && n > 1 && (n & (n - 1)) === 0;

/** False for a wrong password or any stored value it cannot read. Never throws for bad input. */
export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [n, r, p] = parts.slice(1, 4).map(Number);
  // Bounds stop a corrupted or hostile stored value from making us burn memory or CPU.
  if (!isPowerOfTwo(n) || n < 1024 || n > 1 << 17) return false;
  if (!Number.isInteger(r) || r < 1 || r > 32 || !Number.isInteger(p) || p < 1 || p > 4) return false;
  const salt = Buffer.from(parts[4], 'base64');
  const expected = Buffer.from(parts[5], 'base64');
  // The key length is fixed: scrypt output is a prefix of a longer one, so a truncated hash must not verify.
  if (salt.length < 16 || expected.length !== KEY_LENGTH) return false;
  try {
    const key = await scrypt(password, salt, expected.length, options(n, r, p));
    return timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

let dummy: Promise<string> | undefined;

/** Costs the same as checking a real password, then fails. For unknown emails, so timing does not reveal accounts. */
export async function verifyAgainstNothing(password: string): Promise<false> {
  dummy ??= hashPassword(randomBytes(16).toString('hex'));
  await verifyPassword(password, await dummy);
  return false;
}

/** Passwords that meet the length rule but are too easy to guess. Compared ignoring case. */
const OBVIOUS = new Set([
  '000000000000',
  '111111111111',
  '123456789012',
  '1234567890123',
  '1q2w3e4r5t6y',
  'abc123abc123',
  'abcdefghijkl',
  'administrator',
  'changeme1234',
  'iloveyou1234',
  'letmein12345',
  'nhswales1234',
  'password1234',
  'password123!',
  'passwordpassword',
  'practice1234',
  'qwerty123456',
  'qwertyuiop12',
  'qwertyuiop123',
  'reception123',
  'receptionist',
  'surgery12345',
  'welcome12345',
]);

/** Null if the password is acceptable, otherwise a message the person can act on. */
export function checkPasswordPolicy(password: string, email: string): string | null {
  const length = [...password].length;
  if (length < PASSWORD_MIN) return `Your password must be at least ${PASSWORD_MIN} characters long.`;
  if (length > PASSWORD_MAX) return `Your password must be no more than ${PASSWORD_MAX} characters long.`;
  const lower = password.toLowerCase();
  const emailName = email.trim().toLowerCase().split('@')[0] ?? '';
  if (emailName.length >= 3 && lower.includes(emailName)) {
    return 'Your password must not contain your email address. Choose something else.';
  }
  if (OBVIOUS.has(lower) || new Set(lower).size === 1) {
    return 'That password is too easy to guess. Try a few unrelated words together.';
  }
  return null;
}
