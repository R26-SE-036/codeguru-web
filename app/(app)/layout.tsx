import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/server-api';
import { SignOutButton } from './sign-out-button';

/**
 * The platform shell.
 *
 * Replaces CodeGuruBar, which existed in four copies across four repositories -
 * three synced by shell script and PairPath's hand-transcribed to TypeScript,
 * because the script would not overwrite .tsx with .js.
 *
 * Its service links pointed at `{portal}/go?to=<key>`, so that a sibling never
 * needed to know where its siblings lived and the session could be carried
 * across the origin boundary. These are plain hrefs: same app, same origin,
 * same cookie.
 */

const SECTIONS = [
  { href: '/', label: 'Home' },
  { href: '/coach', label: 'Coach' },
  { href: '/study', label: 'Study' },
  { href: '/pair', label: 'Pair' },
  { href: '/play', label: 'Practice' },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  // Middleware already redirects an unauthenticated request, so this is a
  // second line rather than the first. It is here because a layout that assumes
  // a session and gets null renders a broken page instead of a login redirect,
  // and matcher patterns are easy to narrow by accident.
  if (!session) redirect('/login');

  const name = session.user.full_name?.trim() || session.user.email || 'Student';

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-card">
        <nav className="mx-auto flex max-w-6xl items-center gap-1 px-4 py-3">
          <span className="mr-4 font-semibold text-ink">Code Guru</span>

          {SECTIONS.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="rounded-cg px-3 py-1.5 text-sm text-body transition hover:bg-card-alt hover:text-ink"
            >
              {section.label}
            </Link>
          ))}

          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm text-muted">{name}</span>
            <SignOutButton />
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
