import type { NextConfig } from 'next';

// Every page here is per-trainee and read straight from the database, so nothing is cached or prerendered.
// The Content-Security-Policy (with a fresh nonce per request) is set in src/proxy.ts; the headers below are static.

const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Invitation links carry a secret in the path, so the address must never be sent on to another site.
  { key: 'Referrer-Policy', value: 'same-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  {
    key: 'Permissions-Policy',
    value:
      'microphone=(self), camera=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), midi=(), ' +
      'display-capture=(), accelerometer=(), gyroscope=(), magnetometer=(), interest-cohort=()',
  },
];

// Pages whose address or content is a secret: never stored, and not even the origin is sent on.
const secretPageHeaders = [
  { key: 'Cache-Control', value: 'no-store' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
];

// Staging (carenav-staging.ashgrovemedicalgroup.app) and every other preview build: keep them out of search results.
const isPreview = process.env.VERCEL_ENV === 'preview';

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      { source: '/invite/:path*', headers: secretPageHeaders },
      { source: '/setup', headers: secretPageHeaders },
      ...(isPreview ? [{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }] : []),
    ];
  },
};

export default nextConfig;
