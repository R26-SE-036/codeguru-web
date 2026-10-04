'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import {
  ArrowDownCircle,
  BarChart3,
  BookOpen,
  CalendarClock,
  CircleCheck,
  CirclePause,
  CirclePlay,
  Crown,
  FileText,
  FlaskConical,
  Gamepad2,
  History,
  Loader2,
  Lock,
  Map as MapIcon,
  PencilLine,
  ReceiptText,
  RotateCcw,
  Route,
  Sparkles,
  Trophy,
  Unlock,
  type LucideIcon,
} from 'lucide-react';

import { ApiError, api } from '@/lib/api';
import { PRO_ONLY } from '@/lib/plan-features';
import { formatDate, formatLkr, usePlan, type Billing, type SubscriptionEvent } from '@/lib/use-plan';
import { FormError, FormSuccess } from '@/components/field';
import { Modal } from '@/components/modal';
import { ProBadge } from '@/components/pro';
import { Card, PageHeader, buttonClass } from '@/components/ui';

/**
 * Plan & billing: what plan a student is on, what they have used this month,
 * what they have paid, and every way to change it.
 *
 * The three ways out of Pro are deliberately distinct, because they mean
 * different things to the student:
 *   Cancel renewal   keep Pro to the end of what was paid for; undo with Resume
 *   Downgrade now    back to Free at once (and no more renewals)
 *   Reset to Free    demo mode only - wipes the plan to rehearse the upgrade
 */

const DAY = 86_400_000;

const ACCESS: Array<{ label: string; icon: LucideIcon; href: string }> = [
  { label: 'Unlimited lessons', icon: BookOpen, href: '/study' },
  { label: 'Learning map', icon: MapIcon, href: '/study/progress' },
  { label: 'Free play', icon: Gamepad2, href: '/play' },
  { label: 'Leaderboards', icon: Trophy, href: '/play' },
  { label: 'Free coding', icon: PencilLine, href: '/pair' },
  { label: 'Path to the solution', icon: Route, href: '/pair' },
  { label: 'Pair analytics', icon: BarChart3, href: '/pair/analytics' },
];

const EVENT: Record<SubscriptionEvent, { label: string; icon: LucideIcon; tone: string }> = {
  upgraded: { label: 'Upgraded to Pro', icon: Crown, tone: 'text-warn bg-hue-play/15' },
  renewed: { label: 'Pro renewed', icon: RotateCcw, tone: 'text-ok bg-ok/10' },
  cancelled: { label: 'Renewal cancelled', icon: CirclePause, tone: 'text-muted bg-card-alt' },
  resumed: { label: 'Renewal resumed', icon: CirclePlay, tone: 'text-accent bg-accent/10' },
  downgraded: { label: 'Moved to Free', icon: ArrowDownCircle, tone: 'text-danger bg-danger/10' },
  reset: { label: 'Reset to Free (demo)', icon: FlaskConical, tone: 'text-muted bg-card-alt' },
};

type Action = 'cancel' | 'resume' | 'downgrade' | 'reset';

export function BillingView() {
  const router = useRouter();
  const params = useSearchParams();
  const { billing, loading, refresh } = usePlan();
  const [dialog, setDialog] = useState<null | 'cancel' | 'downgrade'>(null);
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // /pro's "Switch to Free" arrives with ?downgrade=1.
  useEffect(() => {
    if (params.get('downgrade') === '1' && billing?.plan.tier === 'pro') setDialog('downgrade');
  }, [params, billing?.plan.tier]);

  async function act(action: Action, done: string) {
    setBusy(action);
    setError(null);
    setNotice(null);
    try {
      await api.post('coach', `/billing/me/${action}`, {});
      await refresh();
      setDialog(null);
      setNotice(done);
      if (params.get('downgrade')) router.replace('/billing');
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
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="cg-skeleton h-64 lg:col-span-2" />
          <div className="cg-skeleton h-64" />
        </div>
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

  const { plan } = billing;
  const pro = plan.tier === 'pro';

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        eyebrow="Account"
        title="Plan & billing"
        lead="Your plan, what you have used this month, and every payment - with a receipt for each."
        icon={ReceiptText}
        tone="text-hue-play"
        toneBg="bg-hue-play/10"
        actions={
          <Link href="/pro" className={buttonClass({ variant: 'secondary', size: 'sm' })}>
            <Sparkles size={14} aria-hidden />
            Compare plans
          </Link>
        }
      />

      {notice && <FormSuccess>{notice}</FormSuccess>}
      {error && !dialog && <FormError>{error}</FormError>}

      <div className="grid gap-6 lg:grid-cols-3">
        <CurrentPlan billing={billing} busy={busy} onCancel={() => setDialog('cancel')} onDowngrade={() => setDialog('downgrade')}
          onResume={() => act('resume', 'Your Pro plan will renew again.')} />
        <Usage billing={billing} />
      </div>

      <Access pro={pro} />
      <Payments billing={billing} />
      <Timeline billing={billing} />

      {billing.checkout.demo && (
        <Card className="flex flex-wrap items-center justify-between gap-4 border-dashed p-5">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-bold text-ink">
              <FlaskConical size={15} className="text-muted" aria-hidden />
              Demo mode
            </p>
            <p className="mt-0.5 text-sm text-muted">Put this account back on Free with this month&rsquo;s free lessons restored, to show the upgrade again.</p>
          </div>
          <button type="button" onClick={() => act('reset', 'This account is back on Free.')} disabled={busy !== null}
            className={buttonClass({ variant: 'secondary', size: 'sm' })}>
            {busy === 'reset' ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <RotateCcw size={14} aria-hidden />}
            Reset to Free
          </button>
        </Card>
      )}

      {/* ── Cancel renewal ── */}
      <Modal open={dialog === 'cancel'} onClose={() => setDialog(null)} title="Cancel your renewal?">
        <div className="space-y-4">
          <p className="text-body">
            You keep Pro until <strong className="text-ink">{formatDate(plan.renews_at ?? plan.ends_at)}</strong>, then move
            to Free. You will not be charged again.
          </p>
          <p className="text-sm text-muted">Changed your mind before then? You can resume from this page.</p>
          {error && <FormError>{error}</FormError>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setDialog(null)} className={buttonClass({ variant: 'ghost' })}>Keep renewing</button>
            <button type="button" onClick={() => act('cancel', `Renewal cancelled. Pro stays until ${formatDate(plan.renews_at ?? plan.ends_at)}.`)}
              disabled={busy !== null} className={buttonClass({ variant: 'danger' })}>
              {busy === 'cancel' && <Loader2 size={15} className="animate-spin" aria-hidden />}
              Cancel renewal
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Downgrade now ── */}
      <Modal open={dialog === 'downgrade'} onClose={() => setDialog(null)} title="Switch to Free now?" width="max-w-xl">
        <div className="space-y-4">
          <p className="text-body">
            You move to <strong className="text-ink">Free straight away</strong> and the renewal stops. The rest of this
            period is not refunded. You will lose:
          </p>
          <ul className="grid gap-1.5 rounded-cg bg-card-alt p-4 sm:grid-cols-2">
            {PRO_ONLY.map((feature) => (
              <li key={feature} className="flex gap-2 text-sm text-body">
                <Lock size={14} className="mt-0.5 shrink-0 text-muted" aria-hidden />
                {feature}
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted">Nothing you have done is deleted - your lessons, XP, achievements and sessions are kept.</p>
          {!plan.cancel_at_period_end && (
            <p className="rounded-cg border border-accent/25 bg-accent-soft px-4 py-3 text-sm text-body">
              Prefer to keep Pro until {formatDate(plan.renews_at)}?{' '}
              <button type="button" onClick={() => setDialog('cancel')} className="font-semibold text-accent hover:underline">
                Cancel the renewal instead
              </button>
              .
            </p>
          )}
          {error && <FormError>{error}</FormError>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setDialog(null)} className={buttonClass({ variant: 'ghost' })}>Stay on Pro</button>
            <button type="button" onClick={() => act('downgrade', 'You are now on Free. Upgrade again any time.')}
              disabled={busy !== null} className={buttonClass({ variant: 'danger' })}>
              {busy === 'downgrade' && <Loader2 size={15} className="animate-spin" aria-hidden />}
              Switch to Free now
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ── Current plan ───────────────────────────────────────────────────────── */

function CurrentPlan({
  billing,
  busy,
  onCancel,
  onDowngrade,
  onResume,
}: {
  billing: Billing;
  busy: Action | null;
  onCancel: () => void;
  onDowngrade: () => void;
  onResume: () => void;
}) {
  const { plan, prices } = billing;

  if (plan.tier === 'free') {
    return (
      <Card className="flex flex-col p-6 lg:col-span-2">
        <p className="text-xs font-bold uppercase tracking-wider text-muted">Current plan</p>
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3">
          <p className="text-3xl font-extrabold tracking-tight text-ink">Free</p>
          <p className="text-muted">LKR 0 · no payment method</p>
        </div>
        <p className="mt-3 max-w-lg text-body">
          The extension, three lessons a month, the daily challenge and exercise pair sessions. Pro opens everything
          else, from {formatLkr(Math.round(prices.year / 12))} a month.
        </p>
        <div className="mt-auto flex flex-wrap gap-2 pt-6">
          <Link href="/pro" className={buttonClass()}>
            <Crown size={16} aria-hidden />
            Upgrade to Pro
          </Link>
          <Link href="/pro" className={buttonClass({ variant: 'ghost' })}>See what you get</Link>
        </div>
      </Card>
    );
  }

  const yearly = plan.interval === 'year';
  const amount = yearly ? prices.year : prices.month;
  const end = plan.ends_at ? new Date(plan.ends_at).getTime() : Date.now();
  const length = (yearly ? 365 : 30) * DAY;
  const left = Math.max(0, Math.ceil((end - Date.now()) / DAY));
  const elapsed = Math.min(100, Math.max(0, 100 - ((end - Date.now()) / length) * 100));

  return (
    <Card className="relative flex flex-col overflow-hidden p-6 lg:col-span-2">
      <span aria-hidden className="pointer-events-none absolute -right-14 -top-14 h-48 w-48 rounded-full bg-hue-play/15 blur-3xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted">Current plan</p>
          <p className="mt-2 flex items-center gap-2 text-3xl font-extrabold tracking-tight text-ink">
            Pro <ProBadge label={yearly ? 'Yearly' : 'Monthly'} />
          </p>
        </div>
        <span className={clsx('rounded-full px-3 py-1 text-xs font-semibold',
          plan.cancel_at_period_end ? 'bg-warn/10 text-warn' : 'bg-ok/10 text-ok')}>
          {plan.cancel_at_period_end ? `Ends ${formatDate(plan.ends_at, false)}` : 'Active'}
        </span>
      </div>

      <dl className="relative mt-5 grid gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted">Next charge</dt>
          <dd className="mt-0.5 font-semibold text-ink">
            {plan.cancel_at_period_end ? 'None' : `${formatLkr(amount)} on ${formatDate(plan.renews_at, false)}`}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Paid with</dt>
          <dd className="mt-0.5 font-semibold text-ink">{plan.provider === 'demo' ? 'Demo payment' : 'PayHere'}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Pro since</dt>
          <dd className="mt-0.5 font-semibold text-ink">{formatDate(plan.started_at)}</dd>
        </div>
      </dl>

      <div className="relative mt-5">
        <div className="flex justify-between text-xs text-muted">
          <span>This {yearly ? 'year' : 'month'} of Pro</span>
          <span>{left} {left === 1 ? 'day' : 'days'} left</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-card-alt">
          <div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-hue-play" style={{ width: `${elapsed}%` }} />
        </div>
      </div>

      <div className="relative mt-auto flex flex-wrap gap-2 pt-6">
        {plan.cancel_at_period_end ? (
          plan.can_resume ? (
            <button type="button" onClick={onResume} disabled={busy !== null} className={buttonClass()}>
              {busy === 'resume' ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <CirclePlay size={16} aria-hidden />}
              Resume renewal
            </button>
          ) : (
            <p className="text-sm text-muted">Renewal was stopped at PayHere. Subscribe again once this period ends.</p>
          )
        ) : (
          <button type="button" onClick={onCancel} disabled={busy !== null} className={buttonClass({ variant: 'secondary' })}>
            <CirclePause size={16} aria-hidden />
            Cancel renewal
          </button>
        )}
        <button type="button" onClick={onDowngrade} disabled={busy !== null} className={buttonClass({ variant: 'ghost' })}>
          <ArrowDownCircle size={16} aria-hidden />
          Switch to Free now
        </button>
      </div>
    </Card>
  );
}

/* ── Usage ──────────────────────────────────────────────────────────────── */

function Usage({ billing }: { billing: Billing }) {
  const { free_lessons: lessons, plan } = billing;
  const pro = plan.tier === 'pro';
  const share = Math.min(100, (lessons.used / Math.max(1, lessons.limit)) * 100);

  return (
    <Card className="flex flex-col p-6">
      <p className="text-xs font-bold uppercase tracking-wider text-muted">This month</p>
      <div className="mt-4 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-cg bg-hue-study/10 text-hue-study">
          <BookOpen size={18} aria-hidden />
        </span>
        <div>
          <p className="font-semibold text-ink">Study lessons</p>
          <p className="text-sm text-muted">{lessons.opened} opened this month</p>
        </div>
      </div>

      {pro ? (
        <p className="mt-5 flex items-center gap-2 rounded-cg bg-ok/10 px-3 py-2.5 text-sm font-semibold text-ok">
          <Unlock size={15} aria-hidden />
          Unlimited on Pro
        </p>
      ) : (
        <div className="mt-5">
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-ink">
              {lessons.used}
              <span className="text-base font-semibold text-muted"> / {lessons.limit}</span>
            </span>
            <span className="text-sm text-muted">free lessons used</span>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-card-alt" role="meter" aria-valuemin={0}
            aria-valuemax={lessons.limit} aria-valuenow={lessons.used} aria-label="Free lessons used this month">
            <div className={clsx('h-full rounded-full transition-[width] duration-500', share >= 100 ? 'bg-danger' : 'bg-hue-study')}
              style={{ width: `${share}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted">
            {lessons.used >= lessons.limit ? 'All used. ' : ''}Back to {lessons.limit} on{' '}
            {/* Colombo time, whatever the browser's: the month turns over there. */}
            {new Date(lessons.resets_at).toLocaleDateString(undefined, { day: 'numeric', month: 'long', timeZone: 'Asia/Colombo' })}.
          </p>
        </div>
      )}

      <p className="mt-auto flex items-center gap-1.5 pt-5 text-xs text-muted">
        <CalendarClock size={13} aria-hidden />
        Months turn over at midnight on the 1st, Sri Lanka time.
      </p>
    </Card>
  );
}

/* ── What the plan opens ────────────────────────────────────────────────── */

function Access({ pro }: { pro: boolean }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted">Your access</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {ACCESS.map((item) => (
          <Link key={item.label} href={pro ? item.href : '/pro'}
            className={clsx('cg-focusable group flex flex-col items-center gap-2 rounded-cg-lg border p-4 text-center transition',
              pro ? 'border-line bg-card hover:border-ok/40' : 'border-dashed border-line bg-card-alt/40 hover:border-hue-play/50')}>
            <span className={clsx('relative grid h-10 w-10 place-items-center rounded-full',
              pro ? 'bg-ok/10 text-ok' : 'bg-card-alt text-muted')}>
              <item.icon size={18} aria-hidden />
              {!pro && (
                <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-hue-play text-amber-950">
                  <Lock size={11} strokeWidth={2.6} aria-hidden />
                </span>
              )}
            </span>
            <span className={clsx('text-xs font-semibold', pro ? 'text-ink' : 'text-muted')}>{item.label}</span>
            <span className="sr-only">{pro ? 'unlocked' : 'locked - part of Pro'}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ── Payments ───────────────────────────────────────────────────────────── */

function Payments({ billing }: { billing: Billing }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted">Payments</h2>
      <Card className="overflow-hidden">
        {billing.payments.length === 0 ? (
          <p className="flex items-center gap-2 px-5 py-5 text-sm text-muted">
            <FileText size={16} aria-hidden />
            No payments yet. Receipts appear here after you upgrade.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-b border-line bg-card-alt text-left text-xs font-bold uppercase tracking-wider text-muted">
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Description</th>
                  <th className="px-5 py-3">Method</th>
                  <th className="px-5 py-3 text-right">Amount</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3"><span className="sr-only">Receipt</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {billing.payments.map((p) => (
                  <tr key={p.payment_id} className="hover:bg-card-alt/50">
                    <td className="whitespace-nowrap px-5 py-3 text-body">{formatDate(p.created_at)}</td>
                    <td className="px-5 py-3 text-ink">{p.description}</td>
                    <td className="px-5 py-3 text-muted">{p.provider === 'demo' ? 'Demo' : p.method ? `PayHere · ${p.method}` : 'PayHere'}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right font-semibold text-ink">
                      {p.amount ? `${p.currency} ${Number(p.amount).toLocaleString('en-LK', { minimumFractionDigits: 2 })}` : '—'}
                    </td>
                    <td className="px-5 py-3">
                      <span className={clsx('rounded-full px-2 py-0.5 text-xs font-semibold capitalize',
                        p.status === 'paid' ? 'bg-ok/10 text-ok' : p.status === 'pending' ? 'bg-warn/10 text-warn' : 'bg-danger/10 text-danger')}>
                        {p.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {p.status === 'paid' && (
                        <Link href={`/billing/receipt/${encodeURIComponent(p.payment_id)}`} className="font-semibold text-accent hover:underline">
                          Receipt
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </section>
  );
}

/* ── Timeline ───────────────────────────────────────────────────────────── */

function Timeline({ billing }: { billing: Billing }) {
  if (billing.events.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted">
        <History size={14} aria-hidden />
        Plan history
      </h2>
      <Card className="p-5">
        <ol className="relative space-y-4 border-l border-line pl-6">
          {billing.events.map((event, i) => {
            const meta = EVENT[event.type] ?? { label: event.type, icon: CircleCheck, tone: 'text-muted bg-card-alt' };
            return (
              <li key={i} className="relative">
                <span className={clsx('absolute -left-[37px] grid h-6 w-6 place-items-center rounded-full ring-4 ring-card', meta.tone)}>
                  <meta.icon size={13} aria-hidden />
                </span>
                <p className="text-sm font-semibold text-ink">
                  {meta.label}
                  {event.interval && (event.type === 'upgraded' || event.type === 'renewed') && (
                    <span className="font-normal text-muted"> · {event.interval === 'year' ? 'yearly' : 'monthly'}{event.provider === 'demo' ? ', demo payment' : ''}</span>
                  )}
                  {event.by === 'payhere' && <span className="font-normal text-muted"> · at PayHere</span>}
                </p>
                <p className="text-xs text-muted">
                  {new Date(event.at).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </p>
              </li>
            );
          })}
        </ol>
      </Card>
    </section>
  );
}
