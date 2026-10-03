'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import clsx from 'clsx';

/**
 * The two pieces of motion the dashboards use, and nothing more.
 *
 * Borrowed in spirit from the project portfolio site, without its animation
 * library: an IntersectionObserver and a requestAnimationFrame loop are all
 * either effect needs, and a dependency for two effects is a dependency
 * every page then pays for.
 *
 * Motion runs once, when something first scrolls into view, and then stops.
 * Nothing here loops. A dashboard is read repeatedly, and a page that keeps
 * moving is one the student learns to look past.
 *
 * Reduced motion is honoured twice: globals.css collapses every transition,
 * and these components skip the work altogether, so the numbers and bars are
 * simply there at their final values.
 */

function prefersReducedMotion(): boolean {
  return (
    typeof window === 'undefined' ||
    typeof IntersectionObserver === 'undefined' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Calls `onShow` once, the first time `ref` scrolls into view. */
function useFirstView(ref: React.RefObject<Element | null>, onShow: () => void) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (prefersReducedMotion()) {
      onShow();
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          onShow();
          observer.disconnect();
        }
      },
      // Slightly before the element is fully on screen, so a card at the
      // bottom edge has finished arriving by the time the eye gets to it.
      { rootMargin: '0px 0px -40px 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
    // Not keyed on onShow: each caller passes it inline, so it is a new
    // function every render, and re-observing would restart the animation.
  }, [ref]);
}

/* ── Reveal ──────────────────────────────────────────────────────────────── */

/**
 * Fades and lifts its children in the first time they scroll into view.
 *
 * Also the trigger for everything drawn inside it: a `.cg-fill` bar or a
 * `.cg-ring-seg` arc stays at zero until the nearest Reveal is shown (see
 * globals.css), so a chart animates when its card arrives rather than while
 * it is still below the fold.
 *
 * `delay` staggers siblings. Keep it small - 60-80ms a step - or a row of
 * cards reads as a queue instead of a group.
 */
export function Reveal({
  as: Tag = 'div',
  delay = 0,
  className,
  style,
  children,
  ...rest
}: React.HTMLAttributes<HTMLElement> & {
  as?: 'div' | 'section' | 'article' | 'li' | 'ol' | 'ul';
  delay?: number;
}) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);
  useFirstView(ref, () => setShown(true));

  return (
    <Tag
      // Every allowed tag is an HTMLElement, which is all the observer needs.
      ref={ref as React.Ref<never>}
      data-reveal={shown ? 'shown' : 'hidden'}
      className={clsx('cg-reveal', className)}
      style={{ ...style, ['--cg-reveal-delay' as string]: `${delay}ms` }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/* ── CountUp ─────────────────────────────────────────────────────────────── */

/**
 * A number that counts up to its value when it first comes into view.
 *
 * The server renders the final value, so the page is correct before any
 * JavaScript runs. The layout effect resets it to zero before the first paint
 * on the client, which is what stops the real number flashing up and then
 * dropping to 0 when the count starts.
 *
 * The animated digits are hidden from screen readers and the final value is
 * read instead - a reader announcing 0, 3, 11, 26 is noise, not information.
 */
export function CountUp({
  value,
  decimals = 0,
  suffix = '',
  duration = 1100,
  className,
}: {
  value: number;
  decimals?: number;
  suffix?: string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(value);
  const animate = useRef(false);

  useLayoutEffect(() => {
    animate.current = value > 0 && !prefersReducedMotion();
    setDisplay(animate.current ? 0 : value);
  }, [value]);

  useFirstView(ref, () => {
    if (!animate.current) return;

    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // Ease-out expo: most of the distance early, then a slow settle onto
      // the real number, which is the part worth reading.
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setDisplay(value * eased);
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  const format = (n: number) =>
    n.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }) + suffix;

  return (
    <span ref={ref} className={className}>
      <span className="sr-only">{format(value)}</span>
      <span aria-hidden className="tabular-nums">
        {format(display)}
      </span>
    </span>
  );
}
