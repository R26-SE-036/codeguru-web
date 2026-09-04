import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Code Guru',
  description:
    'Spot the mistakes you keep making, and work through them with lessons, practice and a partner.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
