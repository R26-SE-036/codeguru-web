import { Gamepad2, LayoutDashboard, Radar, Sparkles, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * The app's sections, in one place.
 *
 * The sidebar, the mobile drawer and the home page's shortcut grid all read
 * this. Three hand-maintained lists is how a section ends up renamed in two of
 * them, and it is also how the icon beside a link stops matching the page it
 * opens.
 *
 * `hue` names a token from app/theme.css rather than a colour. Written as a
 * full class string, not `text-hue-${key}` - Tailwind scans source files for
 * literal class names and an interpolated one is never generated, so the
 * colour silently does not exist in the stylesheet.
 */
export interface Section {
  href: string;
  label: string;
  blurb: string;
  icon: LucideIcon;
  text: string;
  bg: string;
  ring: string;
  gradient: string;
}

export const SECTIONS: Section[] = [
  {
    href: '/',
    label: 'Overview',
    blurb: 'Where you stand today',
    icon: LayoutDashboard,
    text: 'text-hue-home',
    bg: 'bg-hue-home/10',
    ring: 'ring-hue-home/25',
    gradient: 'from-hue-home to-hue-study',
  },
  {
    // Was /coach. The section shows what the editor extension found while you
    // were writing Java; naming it after the service that stores that is an
    // internal detail leaking into the student's navigation.
    href: '/insights',
    label: 'Insights',
    blurb: 'Patterns in your code',
    icon: Radar,
    text: 'text-hue-insight',
    bg: 'bg-hue-insight/10',
    ring: 'ring-hue-insight/25',
    gradient: 'from-hue-insight to-hue-pair',
  },
  {
    href: '/study',
    label: 'Study',
    blurb: 'Lessons built for your gaps',
    icon: Sparkles,
    text: 'text-hue-study',
    bg: 'bg-hue-study/10',
    ring: 'ring-hue-study/25',
    gradient: 'from-hue-study to-hue-rose',
  },
  {
    href: '/pair',
    label: 'Pair',
    blurb: 'Solve it with a partner',
    icon: Users,
    text: 'text-hue-pair',
    bg: 'bg-hue-pair/10',
    ring: 'ring-hue-pair/25',
    gradient: 'from-hue-pair to-hue-insight',
  },
  {
    href: '/play',
    label: 'Practice',
    blurb: 'Short games, tuned to you',
    icon: Gamepad2,
    text: 'text-hue-play',
    bg: 'bg-hue-play/10',
    ring: 'ring-hue-play/25',
    gradient: 'from-hue-play to-hue-rose',
  },
];

/**
 * Which section a path belongs to.
 *
 * Longest match wins, so /study/42/quiz highlights Study. '/' is special-cased
 * because every path starts with it and it would otherwise match everything -
 * the bug this function exists to not have.
 */
export function activeSection(pathname: string): Section | undefined {
  if (pathname === '/') return SECTIONS[0];

  return SECTIONS.filter((section) => section.href !== '/')
    .filter((section) => pathname === section.href || pathname.startsWith(`${section.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
}
