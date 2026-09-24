'use client';

import { forwardRef, useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import clsx from 'clsx';

/**
 * One labelled input, so every form in the app has the same one.
 *
 * The id is generated rather than passed. Hand-written ids were duplicated
 * across the login and register forms, and a duplicate id silently breaks the
 * label -> input association, which is what a screen reader follows and what
 * makes clicking the label focus the field.
 */
export const Field = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }
>(function Field({ label, hint, className, type = 'text', ...props }, ref) {
  const id = useId();
  const hintId = `${id}-hint`;
  const [revealed, setRevealed] = useState(false);

  const isPassword = type === 'password';
  const inputType = isPassword && revealed ? 'text' : type;

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink">
        {label}
      </label>

      <div className="relative">
        <input
          {...props}
          ref={ref}
          id={id}
          type={inputType}
          aria-describedby={hint ? hintId : undefined}
          className={clsx(
            'cg-focusable h-11 w-full rounded-cg border border-line bg-card px-3.5 text-ink',
            'placeholder:text-faint-nontext hover:border-line-strong',
            'focus-visible:border-accent',
            isPassword && 'pr-11',
          )}
        />

        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((value) => !value)}
            // tabIndex -1 so Tab goes label -> field -> submit. A reveal
            // toggle between the password and the button it submits is a
            // keyboard trap in the middle of the most-used path in the app.
            tabIndex={-1}
            aria-label={revealed ? 'Hide password' : 'Show password'}
            className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-cg-sm text-muted transition hover:bg-card-alt hover:text-ink"
          >
            {revealed ? (
              <EyeOff size={16} strokeWidth={2.1} aria-hidden />
            ) : (
              <Eye size={16} strokeWidth={2.1} aria-hidden />
            )}
          </button>
        )}
      </div>

      {hint && (
        <p id={hintId} className="mt-1.5 text-xs text-muted">
          {hint}
        </p>
      )}
    </div>
  );
});

/**
 * role="alert" so the message is announced when it appears. A styled div is
 * silent to a screen reader, and a failed sign-in is exactly the moment the
 * page needs to say something out loud.
 */
export function FormError({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-cg border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm font-medium text-danger"
    >
      <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-danger" />
      {children}
    </p>
  );
}

/** The success counterpart to FormError: a confirmation the student should read. */
export function FormSuccess({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="status"
      className="flex items-start gap-2 rounded-cg border border-ok/30 bg-ok/10 px-3.5 py-2.5 text-sm font-medium text-ok"
    >
      <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ok" />
      {children}
    </p>
  );
}
