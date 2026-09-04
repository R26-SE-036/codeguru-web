'use client';

import { useEffect, useState } from 'react';

/**
 * Read Code Guru design tokens as real colour strings.
 *
 * Ported from Study-Guider lib/theme.js, and it exists for a specific reason
 * worth keeping in front of whoever touches the charts next:
 *
 * Most of the app can hand `var(--cg-accent)` straight to CSS. Recharts cannot.
 * It passes colours through to SVG *presentation attributes* - `stroke`,
 * `fill`, `stopColor` - and a browser does not resolve `var()` inside an
 * attribute value. The element simply renders with no colour at all. Nothing
 * errors; the chart is just invisible.
 *
 * So anything heading for an SVG attribute has to be resolved to a concrete
 * value first. Mermaid has the same problem for the same reason, and
 * app/(app)/study/[triggerId]/lesson/mermaid-diagram.tsx solves it the same way.
 */

/** One token's computed value: cssVar('--cg-accent') -> 'rgb(37, 99, 235)'. */
export function cssVar(name: string, fallback = ''): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name);
  return value.trim() || fallback;
}

/**
 * Resolve a map of { key: '--cg-token' } to { key: 'rgb(...)' }.
 *
 * Pass a module-level constant as `tokens`. A fresh object literal on every
 * render is a new dependency every render, and the effect below would re-run
 * forever.
 */
export function useThemeColors<T extends Record<string, string>>(
  tokens: T,
): Record<keyof T, string> {
  const read = () =>
    Object.fromEntries(
      Object.entries(tokens).map(([key, name]) => [key, cssVar(name)]),
    ) as Record<keyof T, string>;

  const [colors, setColors] = useState<Record<keyof T, string>>(read);

  useEffect(() => {
    const refresh = () => setColors(read());
    // Once after mount, so the first paint picks up the stylesheet even when it
    // resolved after the initial render - which is the common case on a cold
    // load, and produced a chart that stayed uncoloured until an interaction.
    refresh();
    window.addEventListener('codeguru:themechange', refresh);
    return () => window.removeEventListener('codeguru:themechange', refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens]);

  return colors;
}
