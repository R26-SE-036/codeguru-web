'use client';

import { useEffect, useId, useRef, useState } from 'react';
import clsx from 'clsx';
import { Check, ChevronDown, type LucideIcon } from 'lucide-react';

/**
 * A dropdown that looks like the rest of the app.
 *
 * A native <select> opens the operating system's own menu, which no stylesheet
 * reaches - so on the pairing page it was a grey Windows list with a blue bar,
 * in the middle of a themed card, and in dark mode a bright white one.
 *
 * This is the WAI-ARIA "select-only combobox": a button that owns a listbox.
 * Focus stays on the button and the active option is announced through
 * aria-activedescendant, so it reads to a screen reader the way a native
 * select does. Keyboard: arrows, Home/End, Enter or Space to choose, Escape to
 * close, and typing a letter jumps to the next option starting with it.
 */

export interface SelectOption {
  value: string;
  label: string;
  /** A second, quieter line under the label. */
  hint?: string;
  /** A small pill on the right, e.g. a difficulty. */
  badge?: { text: string; className: string };
}

export function Select({
  id,
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  icon: Icon,
  'aria-labelledby': labelledBy,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder: string;
  disabled?: boolean;
  icon?: LucideIcon;
  'aria-labelledby'?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  // Close on a click anywhere else.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  // Keep the active option in view while moving with the keyboard.
  useEffect(() => {
    if (!open) return;
    const row = listRef.current?.children[active] as HTMLElement | undefined;
    row?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  function openAt(index: number) {
    if (disabled || options.length === 0) return;
    setActive(Math.max(0, Math.min(options.length - 1, index)));
    setOpen(true);
  }

  function choose(index: number) {
    const option = options[index];
    if (option) onChange(option.value);
    setOpen(false);
    buttonRef.current?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const last = options.length - 1;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        openAt(selectedIndex >= 0 ? selectedIndex : event.key === 'ArrowUp' ? last : 0);
      }
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActive((i) => Math.min(last, i + 1));
        return;
      case 'ArrowUp':
        event.preventDefault();
        setActive((i) => Math.max(0, i - 1));
        return;
      case 'Home':
        event.preventDefault();
        setActive(0);
        return;
      case 'End':
        event.preventDefault();
        setActive(last);
        return;
      case 'Enter':
      case ' ':
        event.preventDefault();
        choose(active);
        return;
      case 'Escape':
        event.preventDefault();
        setOpen(false);
        return;
      case 'Tab':
        setOpen(false);
        return;
    }

    // Type-ahead: the next option after the active one starting with the key.
    if (event.key.length === 1 && /\S/.test(event.key)) {
      const letter = event.key.toLowerCase();
      for (let step = 1; step <= options.length; step += 1) {
        const index = (active + step) % options.length;
        if (options[index].label.toLowerCase().startsWith(letter)) {
          setActive(index);
          break;
        }
      }
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={labelledBy ? `${labelledBy} ${id}` : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openAt(selectedIndex >= 0 ? selectedIndex : 0))}
        onKeyDown={onKeyDown}
        className={clsx(
          'cg-focusable group flex h-12 w-full items-center gap-3 rounded-cg border bg-card px-3.5 text-left transition',
          open ? 'border-accent ring-4 ring-accent/15' : 'border-line hover:border-line-strong',
          disabled && 'cursor-not-allowed opacity-60 hover:border-line',
        )}
      >
        {Icon && (
          <span
            className={clsx(
              'grid h-7 w-7 shrink-0 place-items-center rounded-cg-sm transition',
              selected ? 'bg-accent/10 text-accent' : 'bg-card-alt text-muted',
            )}
          >
            <Icon size={15} strokeWidth={2.2} aria-hidden />
          </span>
        )}
        <span className={clsx('min-w-0 flex-1 truncate', selected ? 'font-medium text-ink' : 'text-muted')}>
          {selected?.label ?? placeholder}
        </span>
        {selected?.badge && (
          <span className={clsx('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', selected.badge.className)}>
            {selected.badge.text}
          </span>
        )}
        <ChevronDown
          size={17}
          strokeWidth={2.2}
          aria-hidden
          className={clsx('shrink-0 text-muted transition-transform duration-200 ease-cg', open && 'rotate-180 text-accent')}
        />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-labelledby={labelledBy}
          tabIndex={-1}
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 max-h-72 origin-top animate-cg-menu space-y-0.5 overflow-auto rounded-cg-lg border border-line bg-card p-1.5 shadow-cg-lg"
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isActive = index === active;
            return (
              <li
                key={option.value}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={isSelected}
                // Keep focus on the button: a mousedown here would take it.
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(index)}
                className={clsx(
                  'flex cursor-pointer items-center gap-3 rounded-cg-sm px-3 py-2.5 transition-colors',
                  isActive ? 'bg-accent-soft' : 'bg-transparent',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span
                    className={clsx(
                      'block truncate text-sm',
                      isSelected ? 'font-semibold text-accent' : 'font-medium text-ink',
                    )}
                  >
                    {option.label}
                  </span>
                  {option.hint && <span className="mt-0.5 block truncate text-xs text-muted">{option.hint}</span>}
                </span>
                {option.badge && (
                  <span className={clsx('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', option.badge.className)}>
                    {option.badge.text}
                  </span>
                )}
                <Check
                  size={16}
                  strokeWidth={2.6}
                  aria-hidden
                  className={clsx('shrink-0 text-accent', isSelected ? 'opacity-100' : 'opacity-0')}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
