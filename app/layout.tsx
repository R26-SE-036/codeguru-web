import type { Metadata, Viewport } from 'next';
import './globals.css';
import { INLINE_THEME_SCRIPT } from '@/lib/theme-preference';
import { RouteProgress } from '@/components/route-progress';

export const metadata: Metadata = {
  title: {
    default: 'Code Guru',
    template: '%s · Code Guru',
  },
  description:
    'Spot the mistakes you keep making, and work through them with lessons, practice and a partner.',
};

export const viewport: Viewport = {
  // Both, in order: the browser picks the one matching the active theme for
  // the address bar and the iOS status bar. Values are the --cg-rgb-page
  // literals from theme.css; a var() is not resolvable in a meta tag.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F7F8FC' },
    { media: '(prefers-color-scheme: dark)', color: '#0A0E1A' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning because the inline script below mutates
    // <html> before React hydrates. Without it, React compares the attribute
    // it rendered against the one already on the element and warns on every
    // load for anyone who has chosen a theme. It suppresses the warning for
    // THIS element's attributes only, not for the tree beneath it.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          Runs before first paint, so a dark-mode user never sees a white
          flash. It must be inline and synchronous: anything deferred, or
          loaded as a module, paints first and corrects afterwards.
        */}
        <script dangerouslySetInnerHTML={{ __html: INLINE_THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-page bg-cg-wash bg-fixed">
        {/* In the root layout so it also covers login <-> register, and so a
            navigation that replaces the whole app shell does not unmount the
            thing reporting it. It uses usePathname only - useSearchParams
            would force every route out of static rendering. */}
        <RouteProgress />
        {children}
      </body>
    </html>
  );
}
