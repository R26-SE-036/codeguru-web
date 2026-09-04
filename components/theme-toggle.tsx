'use client';

import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import {
  applyTheme,
  readStoredTheme,
  storeTheme,
  THEME_CHOICES,
  type ThemeChoice,
} from '@/lib/theme-preference';

const ICONS = { light: Sun, system: Monitor, dark: Moon } as const;
const LABELS = { light: 'Light', system: 'System', dark: 'Dark' } as const;

/**
 * A three-way segmented control rather than a two-state switch.
 *
 * A switch cannot express "follow my machine", so an app that only has one
 * ends up either ignoring the OS setting or hiding it behind a long-press.
 * System is also the default, which a two-state control has no way to show.
 */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const [choice, setChoice] = useState<ThemeChoice>('system');

  // The server cannot know the stored preference, so the first client render
  // has to match the server's HTML or React logs a hydration mismatch. It
  // renders the default, then this corrects it - and because the inline script
  // in <head> has ALREADY set the attribute, correcting the highlight here
  // never changes what is on screen. Only which pill looks selected.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setChoice(readStoredTheme());
    setReady(true);
  }, []);

  function select(next: ThemeChoice) {
    setChoice(next);
    storeTheme(next);
    applyTheme(next);
  }

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={`inline-flex items-center gap-0.5 rounded-cg-sm border border-line bg-card-alt p-0.5 ${className}`}
    >
      {THEME_CHOICES.map((value) => {
        const Icon = ICONS[value];
        const selected = ready && choice === value;

        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={LABELS[value]}
            title={LABELS[value]}
            onClick={() => select(value)}
            className={`cg-focusable grid h-7 w-8 place-items-center rounded-[7px] ${
              selected
                ? 'bg-card text-accent shadow-cg-xs'
                : 'text-muted hover:text-ink'
            }`}
          >
            <Icon size={14} strokeWidth={2.2} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
