import { afterEach, describe, expect, it } from 'vitest';
import {
  PASSWORD_PARAMS,
  TEST_PASSWORD_PARAMS,
  checkPasswordPolicy,
  hashPassword,
  needsRehash,
  setPasswordCostForTests,
  verifyPassword,
  verifyAgainstNothing,
} from './password';

afterEach(() => setPasswordCostForTests(TEST_PASSWORD_PARAMS));

describe('production cost', () => {
  it('is scrypt N=2^17, r=8, p=1 for new hashes', async () => {
    expect(PASSWORD_PARAMS).toEqual({ N: 131072, r: 8, p: 1 });
    setPasswordCostForTests(undefined);
    const h = await hashPassword('correct horse battery');
    expect(h.split('$').slice(0, 4)).toEqual(['scrypt', '131072', '8', '1']);
    expect(await verifyPassword('correct horse battery', h)).toBe(true);
    expect(needsRehash(h)).toBe(false);
  });
  it('still verifies hashes made with older, cheaper parameters, and says they need rehashing', async () => {
    setPasswordCostForTests({ N: 16384, r: 8, p: 1 });
    const old = await hashPassword('correct horse battery');
    setPasswordCostForTests(undefined);
    expect(await verifyPassword('correct horse battery', old)).toBe(true);
    expect(needsRehash(old)).toBe(true);
    expect(needsRehash('garbage')).toBe(true);
  });
  it('the cheap test cost cannot be switched on outside vitest', () => {
    const was = process.env.VITEST;
    delete process.env.VITEST;
    try {
      expect(() => setPasswordCostForTests({ N: 1024, r: 8, p: 1 })).toThrow();
    } finally {
      process.env.VITEST = was;
    }
  });
});

describe('hashPassword / verifyPassword', () => {
  it('stores scrypt with its parameters, salt and hash', async () => {
    const h = await hashPassword('correct horse battery');
    const parts = h.split('$');
    expect(parts.slice(0, 4)).toEqual(['scrypt', String(TEST_PASSWORD_PARAMS.N), '8', '1']);
    expect(Buffer.from(parts[4], 'base64').length).toBe(16);
    expect(Buffer.from(parts[5], 'base64').length).toBe(64);
  });
  it('salts every hash', async () => {
    expect(await hashPassword('same password here')).not.toBe(await hashPassword('same password here'));
  });
  it('accepts the right password and rejects a wrong one', async () => {
    const h = await hashPassword('correct horse battery');
    expect(await verifyPassword('correct horse battery', h)).toBe(true);
    expect(await verifyPassword('correct horse batterz', h)).toBe(false);
    expect(await verifyPassword('', h)).toBe(false);
  });
  it('rejects malformed or tampered stored values without throwing', async () => {
    const h = await hashPassword('correct horse battery');
    expect(await verifyPassword('correct horse battery', null)).toBe(false);
    expect(await verifyPassword('correct horse battery', '')).toBe(false);
    expect(await verifyPassword('correct horse battery', 'bcrypt$x')).toBe(false);
    const n = `$${TEST_PASSWORD_PARAMS.N}$`;
    expect(await verifyPassword('correct horse battery', h.replace(n, '$2048$'))).toBe(false);
    expect(await verifyPassword('correct horse battery', h.replace(n, '$99999999$'))).toBe(false);
    expect(await verifyPassword('correct horse battery', h.replace(n, '$262144$'))).toBe(false);
    expect(await verifyPassword('correct horse battery', h.slice(0, -4))).toBe(false);
  });
  it('verifyAgainstNothing always fails (used so an unknown email still costs one scrypt)', async () => {
    expect(await verifyAgainstNothing('anything at all')).toBe(false);
  });
});

describe('checkPasswordPolicy', () => {
  const email = 'siân.jones@example.com';
  it('accepts a reasonable password', () => {
    expect(checkPasswordPolicy('kettle on the windowsill', email)).toBeNull();
  });
  it('needs 12 to 128 characters, counted as characters not bytes', () => {
    expect(checkPasswordPolicy('short pass', email)).toMatch(/at least 12/);
    expect(checkPasswordPolicy('ŵyŵyŵyŵyŵyŵ', email)).toMatch(/at least 12/);
    expect(checkPasswordPolicy('ŵyŵyŵyŵyŵyŵy', email)).toBeNull();
    expect(checkPasswordPolicy('a'.repeat(129), email)).toMatch(/128/);
    expect(checkPasswordPolicy('ab'.repeat(64), email)).toBeNull();
  });
  it('must not contain the email name, in any case', () => {
    expect(checkPasswordPolicy('my name is SIÂN.JONES ok', email)).toMatch(/email/);
  });
  it('ignores very short email names', () => {
    expect(checkPasswordPolicy('a perfectly fine one', 'ab@example.com')).toBeNull();
  });
  it('refuses one character repeated', () => {
    expect(checkPasswordPolicy('ŵŵŵŵŵŵŵŵŵŵŵŵ', email)).toMatch(/too easy/);
  });
  it('refuses obvious passwords whatever the case', () => {
    expect(checkPasswordPolicy('Password1234', email)).toMatch(/too easy/);
    expect(checkPasswordPolicy('qwertyuiop123', email)).toMatch(/too easy/);
  });
});
