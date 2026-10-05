'use client';

import Link from 'next/link';
import clsx from 'clsx';
import { Crown, Lock, Sparkles } from 'lucide-react';

import { buttonClass } from '@/components/ui';
import { formatLkr, usePlan } from '@/lib/use-plan';

/**
 * How Pro shows up across the app: a badge, and a lock where a Free student
 * meets a Pro feature. A lock always says what the feature is and offers the
 * upgrade - a dead end that only says "no" teaches nothing about what Pro is.
 */

export function ProBadge({ className, label = 'Pro' }: { className?: string; label?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-300 to-amber-500 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-amber-950 shadow-sm',
        className,
      )}
    >
      <Crown size={11} strokeWidth={2.6} aria-hidden />
      {label}
    </span>
  );
}

export function UpgradeButton({ from, className, size = 'md' }: { from?: string; className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const { billing } = usePlan();
  const price = billing?.price.amount ?? 490;
  return (
    <Link href={from ? `/pro?from=${encodeURIComponent(from)}` : '/pro'} className={buttonClass({ size, className })}>
      <Sparkles size={size === 'sm' ? 14 : 16} strokeWidth={2.3} aria-hidden />
      Upgrade · {formatLkr(price)}/month
    </Link>
  );
}

/** A Pro feature, locked, as a card in place of the feature. */
export function ProLock({
  title,
  description,
  from,
  className,
  compact = false,
}: {
  title: string;
  description: string;
  from?: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={clsx(
        'relative overflow-hidden rounded-cg-lg border border-hue-play/30 bg-gradient-to-br from-hue-play/[0.08] via-card to-card',
        compact ? 'p-5' : 'p-6 sm:p-8',
        className,
      )}
    >
      <span aria-hidden className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-hue-play/15 blur-3xl" />
      <div className={clsx('relative flex gap-4', compact ? 'items-center' : 'flex-col items-start sm:flex-row sm:items-center')}>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-cg bg-hue-play/15 text-warn">
          <Lock size={19} strokeWidth={2.3} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-bold text-ink">
            {title}
            <ProBadge />
          </p>
          <p className="mt-1 text-sm text-body">{description}</p>
        </div>
        <UpgradeButton from={from} size={compact ? 'sm' : 'md'} className="shrink-0" />
      </div>
    </div>
  );
}

/**
 * A Pro section shown behind glass: the real layout, blurred and inert, with
 * the lock over it. Seeing the shape of what is behind the lock is what makes
 * it worth opening.
 */
export function LockedPreview({
  locked,
  title,
  description,
  from,
  children,
}: {
  locked: boolean;
  title: string;
  description: string;
  from?: string;
  children: React.ReactNode;
}) {
  if (!locked) return <>{children}</>;
  return (
    <div className="relative">
      <div aria-hidden inert className="pointer-events-none select-none opacity-50 blur-[3px] saturate-50">
        {children}
      </div>
      <div className="absolute inset-0 grid place-items-center p-4">
        <ProLock title={title} description={description} from={from} compact className="w-full max-w-xl shadow-cg-lg" />
      </div>
    </div>
  );
}
