import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Care navigation call practice',
  description: 'Practice calls for GP reception staff. Training tool: no real patient information.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
