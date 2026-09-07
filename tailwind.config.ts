import type { Config } from 'tailwindcss';

/**
 * Tailwind, pointed at the design tokens in app/theme.css.
 *
 * Colours are remapped onto the `--cg-rgb-*` triplets rather than hard-coded,
 * which is what makes light/dark a values-only change: no component file names
 * a colour, so no component file has to change to support a second theme.
 *
 * Interpolating each triplet with `<alpha-value>` is what keeps opacity
 * modifiers like `bg-card/50` and `text-hue-study/70` working.
 *
 * Scales are named for their ROLE, not numbered. A numeric ramp implies an
 * ordering, and the moment one exists someone reads `card-alt` as darker than
 * `card` - which it is in dark mode and is not in light.
 */
const config: Config = {
  // No `darkMode` variant on purpose. It would only ever match the explicit
  // :root[data-theme='dark'] attribute, so a `dark:` class would silently do
  // nothing for anyone left on "System" - which is the default. Theming goes
  // through the tokens instead, where both cases are handled.
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        page: withAlpha('--cg-rgb-page'),
        'page-alt': withAlpha('--cg-rgb-page-alt'),
        card: withAlpha('--cg-rgb-card'),
        'card-alt': withAlpha('--cg-rgb-card-alt'),
        inset: withAlpha('--cg-rgb-code-bg'),

        ink: withAlpha('--cg-rgb-ink'),
        body: withAlpha('--cg-rgb-body'),
        muted: withAlpha('--cg-rgb-muted'),
        // Below 4.5:1 in both themes and NOT for text. The name is the guard:
        // `text-faint-nontext` is meant to look wrong at the call site.
        'faint-nontext': withAlpha('--cg-rgb-faint'),

        line: withAlpha('--cg-rgb-border'),
        'line-strong': withAlpha('--cg-rgb-border-strong'),

        accent: withAlpha('--cg-rgb-accent'),
        'accent-strong': withAlpha('--cg-rgb-accent-strong'),
        'accent-bright': withAlpha('--cg-rgb-accent-bright'),
        'accent-soft': withAlpha('--cg-rgb-accent-soft'),
        'on-accent': withAlpha('--cg-rgb-on-accent'),

        // One hue per area of the app. `hue.study` etc.
        hue: {
          home: withAlpha('--cg-rgb-hue-home'),
          insight: withAlpha('--cg-rgb-hue-insight'),
          study: withAlpha('--cg-rgb-hue-study'),
          pair: withAlpha('--cg-rgb-hue-pair'),
          play: withAlpha('--cg-rgb-hue-play'),
          rose: withAlpha('--cg-rgb-hue-rose'),
        },

        ok: withAlpha('--cg-rgb-ok'),
        'ok-soft': withAlpha('--cg-rgb-ok-soft'),
        warn: withAlpha('--cg-rgb-warn'),
        'warn-soft': withAlpha('--cg-rgb-warn-soft'),
        danger: withAlpha('--cg-rgb-danger'),
        'danger-soft': withAlpha('--cg-rgb-danger-soft'),
      },
      fontFamily: {
        sans: ['var(--cg-font)'],
        mono: ['var(--cg-font-mono)'],
      },
      borderRadius: {
        'cg-sm': 'var(--cg-radius-sm)',
        cg: 'var(--cg-radius)',
        'cg-lg': 'var(--cg-radius-lg)',
        'cg-xl': 'var(--cg-radius-xl)',
      },
      boxShadow: {
        // Named to match the tokens rather than Tailwind's sm/md/lg, so a
        // stray `shadow-lg` is visibly not one of ours.
        'cg-xs': 'var(--cg-shadow-xs)',
        'cg-sm': 'var(--cg-shadow-sm)',
        'cg-md': 'var(--cg-shadow-md)',
        'cg-lg': 'var(--cg-shadow-lg)',
        'cg-accent': 'var(--cg-shadow-accent)',
        'cg-ring': 'var(--cg-ring)',
      },
      transitionTimingFunction: {
        cg: 'var(--cg-ease)',
      },
      backgroundImage: {
        'cg-brand': 'var(--cg-gradient-brand)',
        'cg-accent': 'var(--cg-gradient-accent)',
        'cg-wash': 'var(--cg-page-wash)',
      },
      keyframes: {
        'cg-rise': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'none' },
        },
        'cg-fade': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'cg-sweep': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'cg-rise': 'cg-rise 0.45s var(--cg-ease) both',
        'cg-fade': 'cg-fade 0.3s var(--cg-ease) both',
        'cg-sweep': 'cg-sweep 1.6s var(--cg-ease) infinite',
      },
    },
  },
  plugins: [],
};

/**
 * `rgb(var(--token) / <alpha-value>)` rather than a plain `var(--token)`.
 * Tailwind substitutes `<alpha-value>` when a class carries an opacity
 * modifier and `1` otherwise; a bare var() would make every such class emit an
 * invalid colour and render nothing.
 */
function withAlpha(token: string): string {
  return `rgb(var(${token}) / <alpha-value>)`;
}

export default config;
