import type { Config } from 'tailwindcss';

/**
 * Tailwind, pointed at the platform's design tokens.
 *
 * The approach is PairPath's, and it is the right one: rather than rewriting
 * class names, remap Tailwind's scales onto the `--cg-rgb-*` triplets in
 * app/theme.css. That is why the theme file publishes colours twice - raw
 * `R G B` triplets for this, and ready-made `rgb()` values for stylesheets and
 * inline styles. Interpolating the triplet with `<alpha-value>` is what keeps
 * opacity modifiers like `bg-surface/50` working.
 *
 * One deliberate departure from PairPath's config. Its neutral ramp is
 * non-monotonic - 950 is the page, 800 an inset on a card, 200 heading text -
 * which is documented there but surprises everyone who reads it as a normal
 * light-to-dark scale. Since three more UIs are about to depend on this, the
 * scales below are named for their role instead of numbered, so there is no
 * implied ordering to misread.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        page: withAlpha('--cg-rgb-page'),
        card: withAlpha('--cg-rgb-card'),
        'card-alt': withAlpha('--cg-rgb-card-alt'),
        inset: withAlpha('--cg-rgb-code-bg'),

        ink: withAlpha('--cg-rgb-ink'),
        body: withAlpha('--cg-rgb-body'),
        muted: withAlpha('--cg-rgb-muted'),
        // --cg-faint is 3.3:1 and is NOT for text. Named so that using it on
        // text looks wrong at the call site.
        'faint-nontext': withAlpha('--cg-rgb-faint'),

        line: withAlpha('--cg-rgb-border'),
        'line-strong': withAlpha('--cg-rgb-border-strong'),

        accent: withAlpha('--cg-rgb-accent'),
        'accent-strong': withAlpha('--cg-rgb-accent-strong'),
        'accent-bright': withAlpha('--cg-rgb-accent-bright'),
        'accent-soft': withAlpha('--cg-rgb-accent-soft'),

        ok: withAlpha('--cg-rgb-ok'),
        warn: withAlpha('--cg-rgb-warn'),
        danger: withAlpha('--cg-rgb-danger'),
        'danger-soft': withAlpha('--cg-rgb-danger-soft'),
      },
      fontFamily: {
        sans: ['var(--cg-font)'],
        mono: ['var(--cg-font-mono)'],
      },
      borderRadius: {
        cg: 'var(--cg-radius)',
      },
      transitionTimingFunction: {
        cg: 'var(--cg-ease)',
      },
    },
  },
  plugins: [],
};

/**
 * `rgb(var(--token) / <alpha-value>)` rather than a plain `var(--token)`.
 * Tailwind substitutes `<alpha-value>` when a class carries an opacity
 * modifier and with `1` otherwise; a bare var() would make every such class
 * silently produce an invalid colour.
 */
function withAlpha(token: string): string {
  return `rgb(var(${token}) / <alpha-value>)`;
}

export default config;
