import { redirect } from 'next/navigation';
import { getSession } from '@/lib/server-api';
import { AppShell } from '@/components/app-shell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  // Middleware already redirects an unauthenticated request, so this is a
  // second line rather than the first. It is here because a layout that assumes
  // a session and gets null renders a broken page instead of a login redirect,
  // and matcher patterns are easy to narrow by accident.
  if (!session) redirect('/login');

  const name = session.user.full_name?.trim() || session.user.email || 'Student';

  return (
    <AppShell name={name} email={session.user.email ?? ''}>
      {children}
    </AppShell>
  );
}
