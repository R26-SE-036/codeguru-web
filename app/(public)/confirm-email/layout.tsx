import type { Metadata } from 'next';

/** Titles the tab; the page is a client component and cannot export metadata. */
export const metadata: Metadata = { title: 'Recovery email' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
