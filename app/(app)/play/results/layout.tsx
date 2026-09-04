import type { Metadata } from 'next';

/**
 * Exists only to title the tab.
 *
 * The page beside this one is a client component, and a client component
 * cannot export `metadata` - Next reads that during the server render, which
 * never happens for a 'use client' module. A layout is a server component by
 * default, so the title lives here and the page keeps its interactivity.
 */
export const metadata: Metadata = { title: 'Practice result' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
