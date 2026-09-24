import type { Metadata } from 'next';

/** Titles the tab; the page is a client component and cannot export metadata. */
export const metadata: Metadata = { title: 'Forgot password' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
