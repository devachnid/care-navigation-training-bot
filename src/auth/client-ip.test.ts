import { describe, expect, it } from 'vitest';
import { ipFromHeaders } from './client-ip';

const h = (o: Record<string, string>) => new Headers(o);

describe('ipFromHeaders', () => {
  it("prefers the platform's own header over anything the client could send", () => {
    expect(ipFromHeaders(h({ 'x-forwarded-for': '6.6.6.6, 1.1.1.1', 'x-real-ip': '2.2.2.2', 'x-vercel-forwarded-for': '3.3.3.3' }))).toBe('3.3.3.3');
    expect(ipFromHeaders(h({ 'x-forwarded-for': '6.6.6.6, 1.1.1.1', 'x-real-ip': '2.2.2.2' }))).toBe('2.2.2.2');
  });
  it('falls back to the first x-forwarded-for entry, then to null', () => {
    expect(ipFromHeaders(h({ 'x-forwarded-for': ' 1.1.1.1 , 9.9.9.9' }))).toBe('1.1.1.1');
    expect(ipFromHeaders(h({}))).toBeNull();
    expect(ipFromHeaders(h({ 'x-real-ip': '  ' }))).toBeNull();
  });
  it('caps the length', () => {
    expect(ipFromHeaders(h({ 'x-real-ip': 'x'.repeat(500) }))!.length).toBe(64);
  });
});
