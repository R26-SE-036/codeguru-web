/**
 * Light / dark / system, and the one-line script that stops the page flashing.
 *
 * ── Why an inline script ────────────────────────────────────────────────────
 * The preference lives in localStorage, which a server component cannot read.
 * So the server always renders the same HTML, and if the attribute were set
 * from a React effect the browser would paint the LIGHT page first and swap on
 * hydration - a white flash on every navigation for anyone using dark, which
 * is the single most common way this feature is got wrong.
 *
 * INLINE_THEME_SCRIPT runs synchronously in <head>, before first paint, and
 * sets the attribute the CSS in app/theme.css keys off. It is deliberately
 * tiny and dependency-free: everything it needs has to exist before React does.
 */

export const THEME_STORAGE_KEY = 'codeguru-theme';

/** Fired after the attribute changes, so charts can re-read their colours. */
export const THEME_CHANGE_EVENT = 'codeguru:themechange';

export const THEME_CHOICES = ['light', 'system', 'dark'] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === 'light' || value === 'dark' || value === 'system';
}

/**
 * 'system' removes the attribute rather than setting it to a value.
 *
 * That is what lets the `@media (prefers-color-scheme: dark)` block in
 * theme.css take over: it is written as `:root:not([data-theme='light'])`, so
 * an absent attribute follows the OS while an explicit one always wins.
 */
export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;

  if (choice === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', choice);
  }

  // Recharts and Mermaid resolve colours to concrete values once, because SVG
  // presentation attributes do not understand var(). Both listen for this.
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: choice }));
}

export function readStoredTheme(): ThemeChoice {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeChoice(stored) ? stored : 'system';
  } catch {
    // Safari in private mode throws on localStorage rather than returning null.
    return 'system';
  }
}

export function storeTheme(choice: ThemeChoice): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Not fatal: the theme still applies for this page, it just will not
    // survive a reload. Better than breaking the toggle.
  }
}

/**
 * Runs in <head> before first paint. Kept as a string because it must not wait
 * for a bundle, and wrapped in try/catch because a storage exception here would
 * abort the whole inline script and leave the page unstyled.
 */
export const INLINE_THEME_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})();`;
