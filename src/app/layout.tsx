import type { Metadata } from 'next';
import { connection } from 'next/server';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Care navigation call practice', template: '%s | Care navigation call practice' },
  description: 'Practice calls for GP reception staff. Training tool: no real patient information.',
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Every page is rendered per request, so the Content-Security-Policy nonce from src/proxy.ts reaches its scripts.
  await connection();
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
