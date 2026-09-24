'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, KeyRound, Loader2, MailCheck, UserRound } from 'lucide-react';

import { ApiError, api } from '@/lib/api';
import { Field, FormError, FormSuccess } from '@/components/field';
import { Card, PageHeader, SectionTitle, buttonClass } from '@/components/ui';

interface Me {
  user: { full_name: string; email: string; recovery_email?: string | null };
}

/**
 * The student's account: who they are signed in as, a recovery email, and the
 * VS Code extension.
 *
 * A recovery email is used only after the student opens the confirmation sent
 * to it (/confirm-email), and adding, changing or removing one asks for the
 * current password - whoever controls that address can reset the password.
 */
export default function AccountPage() {
  const [me, setMe] = useState<Me['user'] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [recovery, setRecovery] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await api.get<Me>('coach', '/auth/me');
      setMe(response.user);
    } catch (err) {
      setLoadError(
        err instanceof ApiError && err.isUnavailable
          ? 'Your account details are unavailable right now.'
          : 'Could not load your account.',
      );
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save(remove: boolean) {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const response = await api.put<{ message: string }>('coach', '/auth/me/recovery-email', {
        recovery_email: remove ? null : recovery.trim(),
        password,
      });
      setDone(response.message);
      setPassword('');
      setRecovery('');
      if (remove) await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Account" title="Your account" icon={UserRound} />

      {loadError && <FormError>{loadError}</FormError>}

      <section>
        <SectionTitle>Signed in as</SectionTitle>
        <Card className="p-6">
          {me ? (
            <dl className="grid gap-3 text-sm sm:grid-cols-[10rem_1fr]">
              <dt className="text-muted">Name</dt>
              <dd className="font-semibold text-ink">{me.full_name}</dd>
              <dt className="text-muted">Email</dt>
              <dd className="font-semibold text-ink">{me.email}</dd>
              <dt className="text-muted">Recovery email</dt>
              <dd className="font-semibold text-ink">
                {me.recovery_email ?? <span className="font-normal text-muted">None</span>}
              </dd>
            </dl>
          ) : (
            !loadError && <div className="h-20" />
          )}
        </Card>
      </section>

      <section>
        <SectionTitle hint="Also receives password-reset links">Recovery email</SectionTitle>
        <Card className="p-6">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              save(false);
            }}
            className="max-w-md space-y-4"
          >
            <p className="flex items-start gap-2 text-sm text-body">
              <MailCheck size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
              We email a confirmation link to the new address. It is used once you open that link.
            </p>

            <Field
              label={me?.recovery_email ? 'New recovery email' : 'Recovery email'}
              type="email"
              autoComplete="email"
              value={recovery}
              onChange={(event) => setRecovery(event.target.value)}
              placeholder="another@example.com"
            />
            <Field
              label="Current password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              hint="Needed to add, change or remove a recovery email."
            />

            {error && <FormError>{error}</FormError>}
            {done && <FormSuccess>{done}</FormSuccess>}

            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={busy || !recovery.trim() || !password} className={buttonClass()}>
                {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
                Send confirmation
              </button>
              {me?.recovery_email && (
                <button
                  type="button"
                  disabled={busy || !password}
                  onClick={() => save(true)}
                  className={buttonClass({ variant: 'danger' })}
                >
                  Remove recovery email
                </button>
              )}
            </div>
          </form>
        </Card>
      </section>

      <section>
        <SectionTitle>Password</SectionTitle>
        <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
          <p className="flex items-start gap-2 text-sm text-body">
            <KeyRound size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
            To change your password, we email you a link. You are then signed out everywhere.
          </p>
          <Link href="/forgot-password" className={buttonClass({ variant: 'secondary' })}>
            Email me a reset link
          </Link>
        </Card>
      </section>

      <section>
        <SectionTitle hint="For Visual Studio Code">Code Coach extension</SectionTitle>
        <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
          <p className="max-w-xl text-sm text-body">
            Code Coach checks your Java as you write it and feeds Insights and Study. Download
            the <code>.vsix</code>, then in VS Code open Extensions, choose the <strong>…</strong>{' '}
            menu and <strong>Install from VSIX…</strong>.
          </p>
          <a href="/download/vscode-extension" className={buttonClass()}>
            <Download size={16} aria-hidden />
            Download the extension
          </a>
        </Card>
      </section>
    </div>
  );
}
