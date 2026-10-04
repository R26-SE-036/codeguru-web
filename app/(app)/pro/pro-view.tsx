'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import {
  ArrowRight,
  Check,
  ChevronDown,
  CreditCard,
  Crown,
  FlaskConical,
  Loader2,
  Minus,
  ReceiptText,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

import { ApiError, api } from '@/lib/api';
import { FEATURE_GROUPS, PLAN_FAQ, type Cell } from '@/lib/plan-features';
import { formatDate, formatLkr, usePlan, yearlySaving, type Billing, type Interval } from '@/lib/use-plan';
import { Field, FormError } from '@/components/field';
import { Modal } from '@/components/modal';
import { ProBadge } from '@/components/pro';
import { Card, PageHeader, buttonClass } from '@/components/ui';

/**
 * The plans: Free and Pro side by side, monthly or yearly, the full
 * comparison, and the questions students actually ask before paying.
 *
 * Paying happens on PayHere's own page: the checkout dialog asks Code Coach
 * for a signed order and posts it there, so card details are typed into
 * PayHere and never into Code Guru. PayHere then tells Code Coach directly,
 * and /pro/return waits for that confirmation.
 *
 * Managing Pro once you have it - renewal, cancelling, downgrading, receipts,
 * usage - is on /billing.
 */

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

const FREE_POINTS = [
  'VS Code extension with every hint level',
  '3 Study lessons a month, with quizzes',
  'The daily challenge, XP and streaks',
  'Exercise pair sessions and the review quiz',
];

const PRO_POINTS = [
  'Everything in Free',
  'Unlimited lessons, the learning map and quiz history',
  'Free play in all four formats, and leaderboards',
  'Free coding with a partner',
  'Your code beside the model solution, and your path to it',
  'Pair analytics',
];

export function ProView() {
  const params = useSearchParams();
  const { billing, loading } = usePlan();
  const [interval, setInterval] = useState<Interval>('month');
  const [checkoutOpen, setCheckoutOpen] = useState(false);

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
  const { perMonth, saved } = yearlySaving(billing.prices);

  return (
    <div className="mx-auto max-w-5xl space-y-12">
      <PageHeader
        eyebrow="Plans"
        title="Learn Java your way"
        lead="Code Guru is free to start, and the VS Code extension stays free forever. Pro unlocks everything else - every lesson, every game, the full pair review."
        icon={Crown}
        tone="text-hue-play"
        toneBg="bg-hue-play/10"
        actions={
          <Link href="/billing" className={buttonClass({ variant: 'secondary', size: 'sm' })}>
            <ReceiptText size={14} aria-hidden />
            Plan &amp; billing
          </Link>
        }
      />

      {params.get('cancelled') === '1' && !pro && (
        <p role="status" className="-mt-6 rounded-cg border border-warn/30 bg-warn/10 px-4 py-2.5 text-sm text-body">
          The payment was cancelled at PayHere, so nothing was charged. You are still on Free.
        </p>
      )}

      {/* ── Plan cards ──────────────────────────────────────────────────── */}
      <section className="space-y-6">
        <div className="flex justify-center">
          <div role="radiogroup" aria-label="Billing period" className="inline-flex rounded-full border border-line bg-card p-1 shadow-cg-sm">
            {(['month', 'year'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={interval === value}
                onClick={() => setInterval(value)}
                className={clsx(
                  'cg-focusable flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition',
                  interval === value ? 'bg-cg-accent text-on-accent shadow-cg-sm' : 'text-muted hover:text-ink',
                )}
              >
                {value === 'month' ? 'Monthly' : 'Yearly'}
                {value === 'year' && (
                  <span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-bold',
                    interval === 'year' ? 'bg-white/20' : 'bg-ok/15 text-ok')}>
                    Save {formatLkr(saved)}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Free */}
          <Card className="flex flex-col p-7">
            <div className="flex items-center justify-between">
              <p className="text-lg font-bold text-ink">Free</p>
              {!pro && <span className="rounded-full bg-card-alt px-2.5 py-1 text-xs font-semibold text-muted">Your plan</span>}
            </div>
            <p className="mt-1 text-sm text-muted">To get started, and to keep the editor help forever.</p>
            <p className="mt-6 flex items-baseline gap-1.5">
              <span className="text-4xl font-extrabold tracking-tight text-ink">LKR 0</span>
              <span className="text-muted">forever</span>
            </p>
            <ul className="mt-6 flex-1 space-y-3">
              {FREE_POINTS.map((point) => (
                <li key={point} className="flex gap-2.5 text-sm text-body">
                  <Check size={17} strokeWidth={2.5} className="mt-0.5 shrink-0 text-muted" aria-hidden />
                  {point}
                </li>
              ))}
            </ul>
            {pro ? (
              <Link href="/billing?downgrade=1" className={buttonClass({ variant: 'secondary', className: 'mt-8 w-full' })}>
                Switch to Free
              </Link>
            ) : (
              <span className={buttonClass({ variant: 'secondary', className: 'pointer-events-none mt-8 w-full opacity-70' })}>
                Current plan
              </span>
            )}
          </Card>

          {/* Pro */}
          <div className="relative rounded-cg-xl bg-gradient-to-br from-amber-300 via-hue-play to-orange-500 p-[1.5px] shadow-cg-lg">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-amber-300 to-amber-500 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-950 shadow">
              Most popular
            </span>
            <div className="flex h-full flex-col rounded-[calc(var(--cg-radius-xl)_-_1.5px)] bg-card p-7">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-2 text-lg font-bold text-ink">Pro <ProBadge /></p>
                {pro && <span className="rounded-full bg-ok/10 px-2.5 py-1 text-xs font-semibold text-ok">Your plan</span>}
              </div>
              <p className="mt-1 text-sm text-muted">For learning every day, alone or with a partner.</p>
              <p className="mt-6 flex items-baseline gap-1.5">
                <span className="text-4xl font-extrabold tracking-tight text-ink">
                  {formatLkr(interval === 'month' ? billing.prices.month : billing.prices.year)}
                </span>
                <span className="text-muted">/ {interval === 'month' ? 'month' : 'year'}</span>
              </p>
              <p className="mt-1 h-5 text-sm text-ok">
                {interval === 'year' ? `That is ${formatLkr(perMonth)} a month - two months free.` : ''}
              </p>
              <ul className="mt-5 flex-1 space-y-3">
                {PRO_POINTS.map((point, i) => (
                  <li key={point} className="flex gap-2.5 text-sm text-body">
                    <Check size={17} strokeWidth={2.6} className={clsx('mt-0.5 shrink-0', i === 0 ? 'text-muted' : 'text-ok')} aria-hidden />
                    <span className={i === 0 ? 'font-semibold text-ink' : ''}>{point}</span>
                  </li>
                ))}
              </ul>
              {pro ? (
                <div className="mt-8 space-y-2">
                  <p className="text-center text-sm text-muted">
                    {billing.plan.cancel_at_period_end
                      ? `Ends on ${formatDate(billing.plan.ends_at)}`
                      : `Renews on ${formatDate(billing.plan.renews_at)}`}
                  </p>
                  <Link href="/billing" className={buttonClass({ className: 'w-full' })}>
                    Manage your plan
                    <ArrowRight size={16} aria-hidden />
                  </Link>
                </div>
              ) : (
                <button type="button" onClick={() => setCheckoutOpen(true)} className={buttonClass({ size: 'lg', className: 'mt-8 w-full' })}>
                  <Sparkles size={17} strokeWidth={2.3} aria-hidden />
                  Upgrade to Pro
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <Comparison billing={billing} />
      <Faq />

      <Checkout open={checkoutOpen} onClose={() => setCheckoutOpen(false)} billing={billing} interval={interval} setInterval={setInterval} />
    </div>
  );
}

/* ── Comparison ─────────────────────────────────────────────────────────── */

function CellView({ value, pro }: { value: Cell; pro?: boolean }) {
  if (value === true) {
    return <Check size={18} strokeWidth={2.6} className={pro ? 'text-ok' : 'text-muted'} aria-label="Included" />;
  }
  if (value === false) return <Minus size={18} className="text-faint-nontext" aria-label="Not included" />;
  return <span className={clsx('text-center text-sm font-semibold', pro ? 'text-ok' : 'text-body')}>{value}</span>;
}

function Comparison({ billing }: { billing: Billing }) {
  const { perMonth } = yearlySaving(billing.prices);
  return (
    <section className="space-y-4">
      <div className="text-center">
        <h2 className="text-2xl font-extrabold tracking-tight text-ink">Compare every feature</h2>
        <p className="mt-1 text-body">What changes between Free and Pro, area by area.</p>
      </div>
      <Card className="overflow-hidden">
        <div className="sticky top-0 z-10 grid grid-cols-[1fr_5.5rem_5.5rem] items-center border-b border-line bg-card-alt/95 px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted backdrop-blur sm:grid-cols-[1fr_9rem_9rem]">
          <span>Feature</span>
          <span className="text-center">Free</span>
          <span className="flex justify-center"><ProBadge /></span>
        </div>
        {FEATURE_GROUPS.map((group) => (
          <div key={group.area} className="border-b border-line last:border-b-0">
            <p className={clsx('px-5 pb-1 pt-5 text-xs font-bold uppercase tracking-wider', group.tone)}>{group.area}</p>
            {group.rows.map((row) => {
              const pro = row.label === 'Price' ? `From ${formatLkr(perMonth)} a month` : row.pro;
              return (
                <div key={row.label} className="grid grid-cols-[1fr_5.5rem_5.5rem] items-center px-5 py-3 transition-colors hover:bg-card-alt/50 sm:grid-cols-[1fr_9rem_9rem]">
                  <span className="pr-3">
                    <span className="block text-sm font-medium text-ink">{row.label}</span>
                    {row.detail && <span className="mt-0.5 block text-xs text-muted">{row.detail}</span>}
                  </span>
                  <span className="flex justify-center"><CellView value={row.free} /></span>
                  <span className="flex justify-center"><CellView value={pro} pro /></span>
                </div>
              );
            })}
          </div>
        ))}
      </Card>
    </section>
  );
}

/* ── FAQ ────────────────────────────────────────────────────────────────── */

function Faq() {
  return (
    <section className="mx-auto max-w-3xl space-y-4">
      <h2 className="text-center text-2xl font-extrabold tracking-tight text-ink">Questions</h2>
      <div className="space-y-2">
        {PLAN_FAQ.map((item) => (
          <details key={item.q} className="group rounded-cg-lg border border-line bg-card px-5 py-4 open:shadow-cg-sm">
            <summary className="cg-focusable flex cursor-pointer list-none items-center justify-between gap-3 font-semibold text-ink [&::-webkit-details-marker]:hidden">
              {item.q}
              <ChevronDown size={18} className="shrink-0 text-muted transition-transform duration-200 group-open:rotate-180" aria-hidden />
            </summary>
            <p className="mt-2 text-sm leading-relaxed text-body">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

/* ── Checkout ───────────────────────────────────────────────────────────── */

function Checkout({
  open,
  onClose,
  billing,
  interval,
  setInterval,
}: {
  open: boolean;
  onClose: () => void;
  billing: Billing;
  interval: Interval;
  setInterval: (value: Interval) => void;
}) {
  const router = useRouter();
  const { refresh } = usePlan();
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [busy, setBusy] = useState<null | 'card' | 'demo'>(null);
  const [error, setError] = useState<string | null>(null);
  const amount = interval === 'month' ? billing.prices.month : billing.prices.year;

  async function payWithCard(event: React.FormEvent) {
    event.preventDefault();
    setBusy('card');
    setError(null);
    try {
      const order = await api.post<{ action_url: string; fields: Record<string, string> }>('coach', '/billing/me/checkout', {
        interval,
        phone: phone.trim(),
        city: city.trim(),
      });
      goToPayHere(order.action_url, order.fields);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start the payment.');
      setBusy(null);
    }
  }

  async function demoPayment() {
    setBusy('demo');
    setError(null);
    try {
      await api.post('coach', '/billing/me/demo-payment', { interval });
      await refresh();
      router.push('/pro/return?demo=1');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The demo payment did not go through.');
      setBusy(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Upgrade to Pro">
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-2">
          {(['month', 'year'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setInterval(value)}
              aria-pressed={interval === value}
              className={clsx(
                'cg-focusable rounded-cg border-2 p-3 text-left transition',
                interval === value ? 'border-accent bg-accent-soft' : 'border-line hover:border-line-strong',
              )}
            >
              <span className="block text-sm font-semibold text-ink">{value === 'month' ? 'Monthly' : 'Yearly'}</span>
              <span className="block text-sm text-muted">
                {formatLkr(value === 'month' ? billing.prices.month : billing.prices.year)} / {value === 'month' ? 'month' : 'year'}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between rounded-cg bg-card-alt px-4 py-3">
          <span className="text-sm text-body">Due today</span>
          <span className="text-lg font-bold text-ink">{formatLkr(amount)}</span>
        </div>

        {billing.checkout.payhere ? (
          <form onSubmit={payWithCard} className="space-y-3">
            <Field label="Mobile number" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07X XXX XXXX"
              inputMode="tel" autoComplete="tel" required minLength={9} maxLength={20} />
            <Field label="City" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Colombo"
              autoComplete="address-level2" required minLength={2} maxLength={60} hint="PayHere asks for these with every payment." />
            <button type="submit" disabled={busy !== null} className={buttonClass({ size: 'lg', className: 'w-full' })}>
              {busy === 'card' ? <Loader2 size={17} className="animate-spin" aria-hidden /> : <CreditCard size={17} aria-hidden />}
              Continue to PayHere
            </button>
            <p className="flex items-start gap-2 text-xs text-muted">
              <ShieldCheck size={14} className="mt-0.5 shrink-0 text-ok" aria-hidden />
              You enter your card on PayHere&rsquo;s secure page. Code Guru never sees it.
              {billing.checkout.sandbox && ' Sandbox: test cards only, no real money.'} Renews every{' '}
              {interval === 'month' ? 'month' : 'year'} until you cancel.
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
            <p className="mt-1 text-xs text-muted">Simulates a successful payment for a demonstration. No card, no gateway.</p>
            <button type="button" onClick={demoPayment} disabled={busy !== null}
              className={buttonClass({ variant: 'secondary', size: 'sm', className: 'mt-3 w-full' })}>
              {busy === 'demo' ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Sparkles size={14} aria-hidden />}
              Demo payment
            </button>
          </div>
        )}

        {error && <FormError>{error}</FormError>}
      </div>
    </Modal>
  );
}
