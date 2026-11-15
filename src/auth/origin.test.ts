import { describe, expect, it } from 'vitest';
import { isSameOrigin } from './origin';

const req = (headers: Record<string, string>) => new Request('https://app.example/api/x', { method: 'POST', headers });

describe('isSameOrigin', () => {
  it('accepts a matching origin', () => {
    expect(isSameOrigin(req({ origin: 'https://app.example', host: 'app.example' }))).toBe(true);
    expect(isSameOrigin(req({ origin: 'http://localhost:3000', host: 'localhost:3000' }))).toBe(true);
  });
  it('uses the forwarded host behind a proxy', () => {
    expect(isSameOrigin(req({ origin: 'https://app.example', host: 'internal:1234', 'x-forwarded-host': 'app.example' }))).toBe(true);
  });
  it('refuses another origin, a missing origin, or junk', () => {
    expect(isSameOrigin(req({ origin: 'https://evil.example', host: 'app.example' }))).toBe(false);
    expect(isSameOrigin(req({ origin: 'https://app.example.evil.example', host: 'app.example' }))).toBe(false);
    expect(isSameOrigin(req({ host: 'app.example' }))).toBe(false);
    expect(isSameOrigin(req({ origin: 'null', host: 'app.example' }))).toBe(false);
  });
});
