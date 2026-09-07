'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, Menu, X } from 'lucide-react';
import clsx from 'clsx';

import { SECTIONS, activeSection } from '@/lib/nav';
import { signOut } from '@/lib/api';
import { Brand } from '@/components/brand';
import { ThemeToggle } from '@/components/theme-toggle';

/**
 * The platform shell: a rail on desktop, a drawer on mobile.
 *
 * What it replaces: four hand-copied navigation bars, one per repository, kept
 * in step by a shell script that refused to overwrite .tsx - so PairPath's was
 * transcribed by hand and drifted. Their links pointed at
 * `{portal}/go?to=<key>` so a session could be carried across an origin
 * boundary. These are plain hrefs: one app, one origin, one cookie.
 *
 * A client component because the active link depends on the current path and
 * the drawer has open/closed state. The pages it wraps stay server components.
 */
export function AppShell({
  name,
  email,
  children,
}: {
  name: string;
  email: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const current = activeSection(pathname);

  const drawerRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);

  // Close on navigation. Without this the drawer stays open over the page the
  // student just asked for, which reads as the tap not having worked.
  useEffect(() => setDrawerOpen(false), [pathname]);

  /*
   * While the drawer is open: Escape closes it, the page behind does not
   * scroll, and Tab cannot leave.
   *
   * The focus trap is the part that was missing. Without it, tabbing out of
   * the last link moves focus to the page BEHIND the overlay - invisible,
   * unreachable by pointer, and impossible to get back from without a mouse.
   * Anyone navigating by keyboard was effectively locked out of the app the
   * moment they opened the menu.
   */
  useEffect(() => {
    if (!drawerOpen) {
      // Focus goes back to the button that opened it, so a keyboard user does
      // not land at the top of the document after closing.
      openerRef.current?.focus();
      return;
    }

    const drawer = drawerRef.current;
    const focusable = () =>
      Array.from(
        drawer?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );

    focusable()[0]?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDrawerOpen(false);
        return;
      }

      if (event.key !== 'Tab') return;

      const items = focusable();
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      // Wrap at both ends. Focus can also start outside the drawer entirely -
      // after a click, it is on the button behind the overlay - so anything
      // not inside it is pulled back in rather than left where it is.
      if (event.shiftKey && (active === first || !drawer?.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !drawer?.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [drawerOpen]);

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[264px_1fr]">
      {/*
        Skip link. Visually hidden until focused, which makes it the first stop
        on Tab for a keyboard or screen-reader user and invisible to everyone
        else. Without it, reaching the page content means tabbing through the
        whole sidebar on every single navigation.
      */}
      <a
        href="#main"
        className="sr-only left-4 top-4 z-[60] rounded-cg-sm bg-cg-accent px-4 py-2 font-semibold text-on-accent shadow-cg-accent focus:not-sr-only focus:fixed"
      >
        Skip to content
      </a>

      {/* ── Desktop rail ─────────────────────────────────────────────────── */}
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-line bg-card/70 px-4 py-5 backdrop-blur-xl lg:flex">
        <Brand className="px-2" />

        <nav aria-label="Sections" className="mt-7 flex flex-1 flex-col gap-1">
          {SECTIONS.map((section) => (
            <NavLink
              key={section.href}
              section={section}
              active={current?.href === section.href}
            />
          ))}
        </nav>

        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <div className="flex items-center gap-3 px-1">
            <Avatar initials={initials} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-ink">{name}</div>
              <div className="truncate text-xs text-muted">{email}</div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 px-1">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => signOut()}
              className="cg-focusable inline-flex items-center gap-1.5 rounded-cg-sm px-2.5 py-1.5 text-sm font-medium text-muted transition hover:bg-danger/10 hover:text-danger"
            >
              <LogOut size={14} strokeWidth={2.2} aria-hidden />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* ── Mobile bar ───────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-col">
        <header className="cg-glass sticky top-0 z-40 flex items-center gap-3 border-b px-4 py-3 lg:hidden">
          <button
            ref={openerRef}
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            aria-expanded={drawerOpen}
            className="cg-focusable grid h-9 w-9 place-items-center rounded-cg-sm border border-line text-ink"
          >
            <Menu size={18} strokeWidth={2.2} aria-hidden />
          </button>

          <Brand showWord={false} />

          <span className="truncate text-sm font-semibold text-ink">
            {current?.label ?? 'Code Guru'}
          </span>

          <ThemeToggle className="ml-auto" />
        </header>

        {/* tabIndex -1 so the skip link can move focus here; without it the
            anchor scrolls the page but leaves focus in the sidebar, and the
            next Tab carries on through the nav as if nothing happened. */}
        <main
          id="main"
          tabIndex={-1}
          className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-10"
        >
          {children}
        </main>
      </div>

      {/* ── Mobile drawer ────────────────────────────────────────────────── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-ink/50 backdrop-blur-sm animate-cg-fade"
          />

          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="absolute inset-y-0 left-0 flex w-[min(19rem,85vw)] flex-col border-r border-line bg-card px-4 py-5 shadow-cg-lg animate-cg-rise"
          >
            <div className="flex items-center justify-between">
              <Brand />
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                className="cg-focusable grid h-9 w-9 place-items-center rounded-cg-sm text-muted hover:bg-card-alt hover:text-ink"
              >
                <X size={18} strokeWidth={2.2} aria-hidden />
              </button>
            </div>

            <nav aria-label="Sections" className="mt-6 flex flex-1 flex-col gap-1">
              {SECTIONS.map((section) => (
                <NavLink
                  key={section.href}
                  section={section}
                  active={current?.href === section.href}
                  withBlurb
                />
              ))}
            </nav>

            <div className="space-y-3 border-t border-line pt-4">
              <div className="flex items-center gap-3">
                <Avatar initials={initials} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-ink">{name}</div>
                  <div className="truncate text-xs text-muted">{email}</div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => signOut()}
                className="cg-focusable inline-flex w-full items-center justify-center gap-2 rounded-cg-sm border border-line px-3 py-2 text-sm font-semibold text-muted transition hover:border-danger/30 hover:bg-danger/10 hover:text-danger"
              >
                <LogOut size={15} strokeWidth={2.2} aria-hidden />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NavLink({
  section,
  active,
  withBlurb = false,
}: {
  section: (typeof SECTIONS)[number];
  active: boolean;
  withBlurb?: boolean;
}) {
  const Icon = section.icon;

  return (
    <Link
      href={section.href}
      aria-current={active ? 'page' : undefined}
      className={clsx(
        'cg-focusable group relative flex items-center gap-3 rounded-cg px-3 py-2.5 transition duration-150 ease-cg',
        active ? 'bg-card-alt' : 'hover:bg-card-alt/70',
      )}
    >
      {/* The active marker is a bar in the section's own hue, so the rail
          shows which area you are in by colour before you read the label. */}
      <span
        aria-hidden
        className={clsx(
          'absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b transition-opacity duration-200',
          section.gradient,
          active ? 'opacity-100' : 'opacity-0',
        )}
      />

      <span
        className={clsx(
          'grid h-8 w-8 shrink-0 place-items-center rounded-cg-sm transition',
          active ? clsx(section.bg, section.text) : 'text-muted group-hover:text-ink',
        )}
      >
        <Icon size={17} strokeWidth={2.1} aria-hidden />
      </span>

      <span className="min-w-0">
        <span
          className={clsx(
            'block truncate text-sm font-semibold',
            active ? 'text-ink' : 'text-body group-hover:text-ink',
          )}
        >
          {section.label}
        </span>
        {withBlurb && (
          <span className="block truncate text-xs text-muted">{section.blurb}</span>
        )}
      </span>
    </Link>
  );
}

function Avatar({ initials }: { initials: string }) {
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-cg-brand text-xs font-bold text-white">
      {initials || '?'}
    </span>
  );
}
