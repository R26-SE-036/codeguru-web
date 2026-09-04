'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * A thin bar across the top while a navigation is in flight.
 *
 * The skeletons cover the case where a route suspends. This covers the gap
 * before that: between the click and the first frame of the new route there is
 * no feedback at all, and on a navigation that resolves in a few hundred
 * milliseconds - too fast to suspend, slow enough to notice - the app looks
 * like it ignored the click.
 *
 * ── Why it listens for clicks rather than asking the router ──────────────────
 * Next 15.3 added `useLinkStatus`, which reports exactly this. This app is on
 * 15.1.6, where the router exposes no pending state at all: `usePathname` only
 * changes once the navigation has ALREADY completed, which is too late to
 * start a progress bar with.
 *
 * So a capture-phase click listener starts it and a pathname change finishes
 * it. That is a heuristic, and the risk with any heuristic here is a bar that
 * starts and never stops - so every case that looks like a link but does not
 * navigate is excluded below, and a timeout clears it regardless.
 */
export function RouteProgress() {
  const pathname = usePathname();

  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Every timer this component sets goes through here, so unmounting or a
  // second navigation cannot leave one behind to fire against dead state.
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };

  useEffect(() => {
    const start = () => {
      clearTimers();
      setVisible(true);
      setProgress(8);

      // Creeps toward 80% and stops. It never reaches 100 on its own: the bar
      // is guessing, and a bar that sits full while the page is still loading
      // is a worse lie than one that sits at 80.
      later(() => setProgress(45), 60);
      later(() => setProgress(80), 400);

      // The safety net. If the click did navigate but to something that never
      // changes the pathname - or the navigation fails outright - this is what
      // stops a bar hanging on screen forever.
      later(() => {
        setProgress(100);
        later(() => setVisible(false), 220);
      }, 8000);
    };

    const onClick = (event: MouseEvent) => {
      // Anything the browser handles itself rather than as an in-app
      // navigation. Each of these would otherwise start a bar that nothing
      // ever finishes.
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const anchor = (event.target as HTMLElement | null)?.closest?.('a');
      if (!anchor) return;

      const href = anchor.getAttribute('href');
      if (!href || anchor.hasAttribute('download') || anchor.target === '_blank') return;

      // Resolved against the current document so a relative href is compared
      // like-for-like rather than by string prefix.
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;

      // A hash on the same page scrolls; it does not navigate. And clicking
      // the link you are already on does nothing to wait for.
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        return;
      }

      start();
    };

    document.addEventListener('click', onClick, { capture: true });
    // Back and forward are navigations too, and they never pass through a link.
    window.addEventListener('popstate', start);

    return () => {
      document.removeEventListener('click', onClick, { capture: true });
      window.removeEventListener('popstate', start);
      clearTimers();
    };
  }, []);

  // The pathname changing IS the navigation completing.
  useEffect(() => {
    clearTimers();
    setProgress(100);
    later(() => {
      setVisible(false);
      // Reset only after it has faded, or the bar visibly rewinds to zero on
      // its way out.
      later(() => setProgress(0), 200);
    }, 200);

    return clearTimers;
  }, [pathname]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-0.5"
      style={{ opacity: visible ? 1 : 0, transition: 'opacity 200ms linear' }}
    >
      <div
        className="h-full bg-cg-brand"
        style={{
          width: `${progress}%`,
          transition: 'width 400ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      />
    </div>
  );
}
