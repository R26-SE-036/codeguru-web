import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import clsx from 'clsx';

/**
 * The shared vocabulary every page is built from.
 *
 * Server components by default - none of these need state, and keeping them
 * off the client means a page of cards ships no JavaScript for its own layout.
 * The two that do need interactivity (the theme toggle, the mobile drawer)
 * live in their own files and say 'use client' there.
 */

/* ── Page header ─────────────────────────────────────────────────────────── */

export function PageHeader({
  eyebrow,
  title,
  lead,
  icon: Icon,
  tone = 'text-accent',
  toneBg = 'bg-accent/10',
  actions,
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
  icon?: LucideIcon;
  tone?: string;
  toneBg?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-4">
        {Icon && (
          <span
            className={clsx(
              'mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-cg',
              toneBg,
              tone,
            )}
          >
            <Icon size={21} strokeWidth={2.1} aria-hidden />
          </span>
        )}

        <div>
          {eyebrow && (
            <p className={clsx('text-xs font-semibold uppercase tracking-widest', tone)}>
              {eyebrow}
            </p>
          )}
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            {title}
          </h1>
          {lead && <p className="mt-2 max-w-2xl text-body">{lead}</p>}
        </div>
      </div>

      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

/* ── Surfaces ────────────────────────────────────────────────────────────── */

/**
 * Extends the host element's own props rather than listing its own.
 *
 * The narrow version accepted only `className`, `children` and `as`, which
 * meant a card could not carry a `role`, an `aria-live` or an `id` - so the
 * one place those were needed (a result that appears without focus moving, and
 * has to be announced) could not use a Card at all without a type error.
 */
export function Card({
  className,
  children,
  as: As = 'div',
  ...rest
}: React.HTMLAttributes<HTMLElement> & {
  children: React.ReactNode;
  as?: 'div' | 'section' | 'article' | 'li';
}) {
  return (
    <As className={clsx('cg-card', className)} {...rest}>
      {children}
    </As>
  );
}

export function SectionTitle({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-base font-semibold text-ink">{children}</h2>
      {hint && <span className="text-sm text-muted">{hint}</span>}
    </div>
  );
}

/* ── Stat tile ───────────────────────────────────────────────────────────── */

/**
 * `hue` arrives as a full Tailwind class string from lib/nav.ts, not a key to
 * interpolate. Tailwind only emits classes it can find literally in source.
 */
export function Stat({
  label,
  value,
  hint,
  href,
  icon: Icon,
  tone = 'text-accent',
  toneBg = 'bg-accent/10',
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  href?: string;
  icon?: LucideIcon;
  tone?: string;
  toneBg?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-medium text-muted">{label}</span>
        {Icon && (
          <span className={clsx('grid h-8 w-8 place-items-center rounded-cg-sm', toneBg, tone)}>
            <Icon size={16} strokeWidth={2.2} aria-hidden />
          </span>
        )}
      </div>

      <div className="mt-3 text-3xl font-bold tabular-nums tracking-tight text-ink">
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </>
  );

  if (!href) return <Card className="p-5">{body}</Card>;

  return (
    <Link href={href} className="cg-card cg-card-hover cg-focusable block p-5">
      {body}
    </Link>
  );
}

/* ── Badge ───────────────────────────────────────────────────────────────── */

const BADGE_TONES = {
  neutral: 'bg-card-alt text-muted ring-line',
  accent: 'bg-accent/10 text-accent ring-accent/25',
  ok: 'bg-ok/10 text-ok ring-ok/25',
  warn: 'bg-warn/10 text-warn ring-warn/25',
  danger: 'bg-danger/10 text-danger ring-danger/25',
} as const;

export type BadgeTone = keyof typeof BADGE_TONES;

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-cg-sm px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ── Button ──────────────────────────────────────────────────────────────── */

const BUTTON_VARIANTS = {
  primary:
    'bg-cg-accent text-on-accent shadow-cg-accent hover:brightness-110 active:brightness-95',
  secondary: 'border border-line bg-card text-ink hover:border-line-strong hover:bg-card-alt',
  ghost: 'text-muted hover:bg-card-alt hover:text-ink',
  danger: 'border border-danger/30 bg-danger/10 text-danger hover:bg-danger/20',
} as const;

const BUTTON_SIZES = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
} as const;

export function buttonClass({
  variant = 'primary',
  size = 'md',
  className,
}: {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: keyof typeof BUTTON_SIZES;
  className?: string;
} = {}) {
  return clsx(
    'cg-focusable inline-flex select-none items-center justify-center gap-2 rounded-cg-sm font-semibold',
    'transition duration-150 ease-cg disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none',
    BUTTON_VARIANTS[variant],
    BUTTON_SIZES[size],
    className,
  );
}

/* ── Empty state ─────────────────────────────────────────────────────────── */

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center px-6 py-12 text-center">
      {Icon && (
        <span className="mb-4 grid h-12 w-12 place-items-center rounded-cg-lg bg-accent/10 text-accent">
          <Icon size={22} strokeWidth={2} aria-hidden />
        </span>
      )}
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {children && <div className="mt-2 max-w-md text-sm text-body">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </Card>
  );
}

/* ── Unreachable-service notice ──────────────────────────────────────────────
   Every page that fetches has one of these, and the wording matters more than
   it looks. Rendering zeroes when a service is down tells the student they
   have nothing to work on - a different claim from "we could not find out",
   and the one that quietly makes a broken integration look like a working
   product. */

export function Unavailable({ what, className }: { what: string; className?: string }) {
  return (
    <div
      className={clsx(
        'flex items-start gap-3 rounded-cg border border-warn/30 bg-warn/10 px-4 py-3',
        className,
      )}
    >
      <span
        aria-hidden
        className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-warn"
      />
      <p className="text-sm text-body">
        <span className="font-semibold text-ink">{what} is unavailable right now.</span>{' '}
        Nothing has been lost — this will fill in as soon as the connection is back.
      </p>
    </div>
  );
}

/* ── Meter ───────────────────────────────────────────────────────────────── */

export function Meter({
  value,
  tone = 'bg-accent',
  label,
}: {
  /** 0-100. Clamped, because a mastery score arriving as 0-1 or as 140 should
   *  produce a short bar or a full one, never a bar wider than its track. */
  value: number;
  tone?: string;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));

  return (
    <div
      role="meter"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className="h-1.5 w-full overflow-hidden rounded-full bg-card-alt ring-1 ring-inset ring-line"
    >
      <div
        className={clsx('h-full rounded-full transition-[width] duration-500 ease-cg', tone)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
