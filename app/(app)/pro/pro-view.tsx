'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import {
  BookOpen,
  CalendarClock,
  Check,
  Code2,
  CreditCard,
  Crown,
  FlaskConical,
  Gamepad2,
  Loader2,
  Lock,
  Minus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';

import { ApiError, api } from '@/lib/api';
import { formatLkr, usePlan, type Billing } from '@/lib/use-plan';
import { Field, FormError } from '@/components/field';
import { ProBadge } from '@/components/pro';
import { Card, PageHeader, buttonClass } from '@/components/ui';

/**
 * Code Guru Pro: the plans side by side, the upgrade, and - once a student
 * has Pro - their renewal, payments and Cancel.
 *
 * Paying happens on PayHere's own page: this page asks Code Coach for a
 * signed order and posts it there. Card details are typed into PayHere, never
 * into Code Guru. PayHere then tells Code Coach directly, and /pro/return
 * waits for that confirmation - see app/services/billing_service.py there.
 */

type Row = { label: string; free: string | boolean; pro: string | boolean };

const PLAN: Array<{ area: string; icon: typeof Code2; tone: string; rows: Row[] }> = [
  {
    area: 'Code Coach',
    icon: Code2,
    tone: 'text-hue-insight',
    rows: [
      { label: 'VS Code extension: live mistake detection', free: true, pro: true },
      { label: 'Concept, guidance and targeted hints', free: true, pro: true },
      { label: 'Overview and Insights dashboards', free: true, pro: true },
    ],
  },
  {
    area: 'Study',
    icon: BookOpen,
    tone: 'text-hue-study',
    rows: [
      { label: 'Lessons written for your mistakes, with quizzes', free: '3 a month', pro: 'Unlimited' },
      { label: 'Learning map and review reminders', free: false, pro: true },
    ],
  },
  {
    area: 'Practice',
    icon: Gamepad2,
    tone: 'text-hue-play',
    rows: [
      { label: 'Daily challenge', free: true, pro: true },
      { label: 'Free play: any format, any concept', free: false, pro: true },
      { label: 'Leaderboards', free: false, pro: true },
    ],
  },
  {
    area: 'Pair',
    icon: Users,
    tone: 'text-hue-pair',
    rows: [
      { label: 'Exercise sessions with live nudges', free: true, pro: true },
      { label: 'Review quiz after each session', free: true, pro: true },
      { label: 'Free coding, no topic', free: false, pro: true },
      { label: 'Your code beside the model solution, and your path to it', free: false, pro: true },
      { label: 'Pair analytics', free: false, pro: true },
    ],
  },
];

function Cell({ value, pro }: { value: string | boolean; pro?: boolean }) {
  if (value === true) {
    return <Check size={17} strokeWidth={2.6} className={pro ? 'text-ok' : 'text-muted'} aria-label="Included" />;
  }
  if (value === false) return <Minus size={17} className="text-faint-nontext" aria-label="Not included" />;
  return <span className={clsx('text-sm font-semibold', pro ? 'text-ok' : 'text-body')}>{value}</span>;
}

function when(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Post the signed order to PayHere as a normal form, so the browser navigates there. */
function goToPayHere(actionUrl: string, fields: Record<string, string>) {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = actionUrl;
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

export function ProView() {
  const router = useRouter();
  const params = useSearchParams();
  const { billing, loading, refresh } = usePlan();
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [busy, setBusy] = useState<null | 'card' | 'demo' | 'cancel' | 'reset'>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const cancelledAtPayHere = params.get('cancelled') === '1';

  async function payWithCard(event: React.FormEvent) {
    event.preventDefault();
    setBusy('card');
    setError(null);
    try {
      const order = await api.post<{ action_url: string; fields: Record<string, string> }>(
        'coach',
        '/billing/me/checkout',
        { phone: phone.trim(), city: city.trim() },
      );
      goToPayHere(order.action_url, order.fields);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start the payment.');
      setBusy(null);
    }
  }

  async function act(kind: 'demo' | 'cancel' | 'reset', path: string) {
    setBusy(kind);
    setError(null);
    try {
      await api.post('coach', path, {});
      await refresh();
      setConfirmCancel(false);
      if (kind === 'demo') router.push('/pro/return?demo=1');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That did not go through. Try again.');
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="cg-skeleton h-24 w-full" />
        <div className="cg-skeleton h-96 w-full" />
      </div>
    );
  }

  if (!billing) {
    return (
      <div className="mx-auto max-w-2xl">
        <FormError>Your plan could not be loaded right now. Please try again shortly.</FormError>
      </div>
    );
  }

  const pro = billing.plan.tier === 'pro';

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        eyebrow="Plans"
        title={pro ? 'You have Code Guru Pro' : 'Code Guru Pro'}
        lead={
          pro
            ? 'Every lesson, free play, leaderboards, free coding and the full pair review are unlocked.'
            : 'The VS Code extension stays free, always. Pro unlocks unlimited lessons, free play, leaderboards, free coding and the full pair review.'
        }
        icon={Crown}
        tone="text-hue-play"
        toneBg="bg-hue-play/10"
      />

      {cancelledAtPayHere && !pro && (
        <p role="status" className="rounded-cg border border-warn/30 bg-warn/10 px-4 py-2.5 text-sm text-body">
          The payment was cancelled at PayHere, so nothing was charged. You are still on Free.
        </p>
      )}

      {pro ? (
        <Manage billing={billing} busy={busy} confirmCancel={confirmCancel} setConfirmCancel={setConfirmCancel} act={act} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
          <Comparison />
          <Card className="h-fit overflow-hidden lg:sticky lg:top-6">
            <div className="relative bg-gradient-to-br from-hue-play/15 via-card to-card px-6 pb-5 pt-6">
              <ProBadge />
              <p className="mt-3 flex items-baseline gap-1.5">
                <span className="text-4xl font-extrabold tracking-tight text-ink">{formatLkr(billing.price.amount)}</span>
                <span className="text-muted">/ month</span>
              </p>
              <p className="mt-1 text-sm text-body">Renews monthly. Cancel any time - Pro lasts to the end of what you paid for.</p>
            </div>

            <div className="space-y-4 border-t border-line p-6">
              {billing.checkout.payhere ? (
                <form onSubmit={payWithCard} className="space-y-3">
                  <Field label="Mobile number" value={phone} onChange={(e) => setPhone(e.target.value)}
                    placeholder="07X XXX XXXX" inputMode="tel" autoComplete="tel" required minLength={9} maxLength={20} />
                  <Field label="City" value={city} onChange={(e) => setCity(e.target.value)}
                    placeholder="Colombo" autoComplete="address-level2" required minLength={2} maxLength={60}
                    hint="PayHere asks for these with every payment." />
                  <button type="submit" disabled={busy !== null} className={buttonClass({ size: 'lg', className: 'w-full' })}>
                    {busy === 'card' ? <Loader2 size={17} className="animate-spin" aria-hidden /> : <CreditCard size={17} aria-hidden />}
                    Pay with PayHere
                  </button>
                  <p className="flex items-start gap-2 text-xs text-muted">
                    <ShieldCheck size={14} className="mt-0.5 shrink-0 text-ok" aria-hidden />
                    You enter your card on PayHere&rsquo;s secure page. Code Guru never sees it.
                    {billing.checkout.sandbox && ' (Sandbox: test cards only, no real money.)'}
                  </p>
                </form>
              ) : (
                <p className="text-sm text-muted">Card payments are not set up on this server.</p>
              )}

              {billing.checkout.demo && (
                <div className="rounded-cg border border-dashed border-line-strong p-4">
                  <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
                    <FlaskConical size={13} aria-hidden />
                    Demo mode
                  </p>
                  <p className="mt-1 text-xs text-muted">For demonstrations: simulates a successful payment. No card, no gateway.</p>
                  <button type="button" onClick={() => act('demo', '/billing/me/demo-payment')} disabled={busy !== null}
                    className={buttonClass({ variant: 'secondary', size: 'sm', className: 'mt-3 w-full' })}>
                    {busy === 'demo' ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Sparkles size={14} aria-hidden />}
                    Demo payment
                  </button>
                </div>
              )}

              {error && <FormError>{error}</FormError>}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function Comparison() {
  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-[1fr_5.5rem_5.5rem] items-center border-b border-line bg-card-alt px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted sm:grid-cols-[1fr_7rem_7rem]">
        <span>What you get</span>
        <span className="text-center">Free</span>
        <span className="flex justify-center"><ProBadge /></span>
      </div>
      {PLAN.map((group) => (
        <div key={group.area} className="border-b border-line last:border-b-0">
          <p className={clsx('flex items-center gap-2 px-5 pb-1 pt-4 text-sm font-bold', group.tone)}>
            <group.icon size={15} strokeWidth={2.3} aria-hidden />
            {group.area}
          </p>
          {group.rows.map((row) => (
            <div key={row.label} className="grid grid-cols-[1fr_5.5rem_5.5rem] items-center px-5 py-2.5 sm:grid-cols-[1fr_7rem_7rem]">
              <span className="pr-3 text-sm text-body">{row.label}</span>
              <span className="flex justify-center"><Cell value={row.free} /></span>
              <span className="flex justify-center"><Cell value={row.pro} pro /></span>
            </div>
          ))}
        </div>
      ))}
    </Card>
  );
}

function Manage({
  billing,
  busy,
  confirmCancel,
  setConfirmCancel,
  act,
}: {
  billing: Billing;
  busy: string | null;
  confirmCancel: boolean;
  setConfirmCancel: (value: boolean) => void;
  act: (kind: 'demo' | 'cancel' | 'reset', path: string) => void;
}) {
  const { plan } = billing;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-6">
        <Card className="relative overflow-hidden p-6">
          <span aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-hue-play/15 blur-3xl" />
          <div className="relative flex flex-wrap items-center gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-cg-lg bg-hue-play/15 text-warn">
              <Crown size={22} strokeWidth={2.2} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-lg font-bold text-ink">Pro <ProBadge label={plan.status === 'cancelled' ? 'Ending' : 'Active'} /></p>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-body">
                <CalendarClock size={14} aria-hidden />
                {plan.cancel_at_period_end ? `Ends on ${when(plan.ends_at)} - it will not renew.` : `Renews on ${when(plan.renews_at)}.`}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {plan.provider === 'demo' ? 'Activated with a demo payment.' : 'Paid through PayHere.'}
                {plan.started_at && ` Pro since ${when(plan.started_at)}.`}
              </p>
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <p className="border-b border-line bg-card-alt px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted">Payments</p>
          {billing.payments.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted">No payments yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {billing.payments.map((p, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <span className="text-body">{when(p.created_at)}</span>
                  <span className="text-muted">{p.provider === 'demo' ? 'Demo payment' : 'PayHere'}</span>
                  <span className="font-semibold text-ink">{p.amount ? `${p.currency} ${p.amount}` : '—'}</span>
                  <span className={clsx('rounded-full px-2 py-0.5 text-xs font-semibold',
                    p.status === 'paid' ? 'bg-ok/10 text-ok' : 'bg-danger/10 text-danger')}>{p.status}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="h-fit space-y-4 p-6">
        <p className="font-bold text-ink">Try what Pro unlocked</p>
        <div className="grid gap-2">
          <Link href="/play" className={buttonClass({ variant: 'secondary', size: 'sm' })}><Gamepad2 size={14} aria-hidden />Free play &amp; leaderboards</Link>
          <Link href="/pair" className={buttonClass({ variant: 'secondary', size: 'sm' })}><Users size={14} aria-hidden />Free coding in Pair</Link>
          <Link href="/study/progress" className={buttonClass({ variant: 'secondary', size: 'sm' })}><BookOpen size={14} aria-hidden />Learning map</Link>
        </div>

        <div className="border-t border-line pt-4">
          {plan.cancel_at_period_end ? (
            <p className="text-sm text-muted">Renewal is off. Pro stays until {when(plan.ends_at)}.</p>
          ) : confirmCancel ? (
            <div className="space-y-2">
              <p className="text-sm text-body">Stop renewing? You keep Pro until {when(plan.renews_at)}.</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => act('cancel', '/billing/me/cancel')} disabled={busy !== null}
                  className={buttonClass({ variant: 'danger', size: 'sm' })}>
                  {busy === 'cancel' && <Loader2 size={14} className="animate-spin" aria-hidden />}
                  Yes, cancel
                </button>
                <button type="button" onClick={() => setConfirmCancel(false)} className={buttonClass({ variant: 'ghost', size: 'sm' })}>Keep Pro</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmCancel(true)} className={buttonClass({ variant: 'ghost', size: 'sm' })}>
              <Lock size={14} aria-hidden />
              Cancel subscription
            </button>
          )}
        </div>

        {billing.checkout.demo && (
          <div className="border-t border-line pt-4">
            <p className="text-xs text-muted">Demo mode: put this account back on Free to show the upgrade again.</p>
            <button type="button" onClick={() => act('reset', '/billing/me/reset')} disabled={busy !== null}
              className={buttonClass({ variant: 'secondary', size: 'sm', className: 'mt-2' })}>
              {busy === 'reset' ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <RotateCcw size={14} aria-hidden />}
              Reset to Free
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}
