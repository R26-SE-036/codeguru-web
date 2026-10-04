'use client';

import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * A dialog over the page: Escape and the backdrop close it, focus moves into
 * it on open and back to whatever opened it on close.
 *
 * Rendered into document.body, not where it is written. Left in place it is a
 * child of whatever layout holds it, and a `space-y-*` parent gave the fixed
 * overlay a 3rem top margin - a strip of the page left uncovered and clickable
 * above the backdrop.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  width = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: string;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const returnTo = useRef<Element | null>(null);
  // The latest onClose, without re-running the open/close effect when a
  // parent passes a new function each render - which would steal focus back
  // to the first field on every keystroke.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement;
    const panel = panelRef.current;
    // The first field if there is one, otherwise the panel itself.
    const first = panel?.querySelector<HTMLElement>('input, select, textarea, button:not([data-close])');
    (first ?? panel)?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      (returnTo.current as HTMLElement | null)?.focus?.();
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-ink/50 backdrop-blur-sm animate-cg-fade"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative max-h-[90vh] w-full ${width} overflow-auto rounded-cg-xl border border-line bg-card shadow-cg-lg outline-none animate-cg-rise`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-4">
          <h2 id={titleId} className="text-lg font-bold text-ink">
            {title}
          </h2>
          <button
            type="button"
            data-close
            onClick={onClose}
            aria-label="Close"
            className="cg-focusable grid h-9 w-9 place-items-center rounded-cg-sm text-muted hover:bg-card-alt hover:text-ink"
          >
            <X size={18} strokeWidth={2.2} aria-hidden />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
