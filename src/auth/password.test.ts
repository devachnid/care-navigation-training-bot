import { describe, expect, it } from 'vitest';
import { checkPasswordPolicy, hashPassword, verifyPassword, verifyAgainstNothing } from './password';

describe('hashPassword / verifyPassword', () => {
  it('stores scrypt with its parameters, salt and hash', async () => {
    const h = await hashPassword('correct horse battery');
    const parts = h.split('$');
    expect(parts.slice(0, 4)).toEqual(['scrypt', '16384', '8', '1']);
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
    expect(await verifyPassword('correct horse battery', h.replace('$16384$', '$1024$'))).toBe(false);
    expect(await verifyPassword('correct horse battery', h.replace('$16384$', '$99999999$'))).toBe(false);
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
