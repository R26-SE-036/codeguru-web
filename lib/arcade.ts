import {
  Brain,
  Bug,
  CalendarCheck,
  Compass,
  Crown,
  Flame,
  Gamepad2,
  Layers,
  ListOrdered,
  Medal,
  Mountain,
  RefreshCw,
  Rocket,
  ScanSearch,
  Sparkles,
  Star,
  TrendingUp,
  Trophy,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';

/**
 * The Practice reward loop, as the web app sees it.
 *
 * The rules live in the gamification engine (services/rewards/*); these are
 * the shapes it returns and the few presentation tables shared by the Practice
 * home, the game player and the results page - so an achievement has the same
 * icon and colour on all three.
 */

export interface LevelInfo {
  level: number;
  title: string;
  xp: number;
  intoLevel: number;
  levelSize: number;
  toNext: number;
  /** 0-1 through the current level. */
  progress: number;
}

export type Tier = 'bronze' | 'silver' | 'gold';

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  tier: Tier;
  target: number;
  current: number;
  unlocked: boolean;
  unlockedAt: string | null;
  xp?: number;
}

export interface Quest {
  id: string;
  title: string;
  description: string;
  icon: string;
  target: number;
  current: number;
  xp: number;
  complete: boolean;
  claimed: boolean;
}

export interface PlayerOverview {
  player: {
    displayName: string | null;
    showOnLeaderboard: boolean;
    level: LevelInfo;
    totalScore: number;
  };
  streak: {
    current: number;
    playedToday: boolean;
    atRisk: boolean;
    shieldWillBeUsed?: boolean;
    longest: number;
    freezes: number;
  };
  stats: Record<string, number>;
  week: { xp: number; rank: number | null; players: number; endsAt: string };
  allTime: { rank: number | null; players: number };
  achievements: Achievement[];
  quests: { endsAt: string; items: Quest[] };
  daily: {
    day: string;
    resetsAt: string;
    completed: { score: number; xp: number; timeTakenSeconds: number } | null;
    question: { gameType: string; conceptTag: string; difficulty: string } | null;
  };
  badges: string[];
}

/** What one round earned, from POST /game/submit. */
export interface RoundRewards {
  xp: { total: number; round: { total: number; lines: { label: string; amount: number }[] } };
  level: LevelInfo & { before: number; leveledUp: boolean };
  streak: {
    current: number;
    longest: number;
    freezes: number;
    extended: boolean;
    freezeUsed: boolean;
    freezeEarned: boolean;
  };
  achievements: Achievement[];
  questsCompleted: Quest[];
  quests: Quest[];
  daily: { counted: boolean; score: number; xp: number } | null;
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  initials: string;
  level: number;
  value: number;
  seconds: number | null;
  you: boolean;
}

export interface Leaderboard {
  period: 'week' | 'all' | 'today';
  total: number;
  resetsAt: string | null;
  entries: LeaderboardEntry[];
  you: LeaderboardEntry | null;
}

/* ── Presentation ───────────────────────────────────────────────────────── */

const ICONS: Record<string, LucideIcon> = {
  rocket: Rocket,
  gamepad: Gamepad2,
  crown: Crown,
  star: Star,
  sparkles: Sparkles,
  brain: Brain,
  zap: Zap,
  mountain: Mountain,
  trophy: Trophy,
  compass: Compass,
  layers: Layers,
  refresh: RefreshCw,
  flame: Flame,
  calendar: CalendarCheck,
  trending: TrendingUp,
  medal: Medal,
};

export function iconFor(name: string | undefined): LucideIcon {
  return ICONS[name ?? ''] ?? Trophy;
}

/** Colours per tier. Full class strings, so Tailwind generates them. */
export const TIER: Record<Tier, { label: string; tile: string; ring: string; glow: string }> = {
  bronze: {
    label: 'Bronze',
    tile: 'bg-hue-rose/10 text-hue-rose',
    ring: 'ring-hue-rose/30',
    glow: 'bg-hue-rose/25',
  },
  silver: {
    label: 'Silver',
    tile: 'bg-hue-insight/10 text-hue-insight',
    ring: 'ring-hue-insight/30',
    glow: 'bg-hue-insight/25',
  },
  gold: {
    label: 'Gold',
    tile: 'bg-hue-play/15 text-hue-play',
    ring: 'ring-hue-play/40',
    glow: 'bg-hue-play/30',
  },
};

/** The four formats, as a player meets them. */
export const FORMATS: Array<{
  type: 'BugHunt' | 'DragDrop' | 'CodeTrace' | 'CodeFix';
  name: string;
  blurb: string;
  icon: LucideIcon;
  tone: string;
  bg: string;
}> = [
  {
    type: 'BugHunt',
    name: 'Bug Hunt',
    blurb: 'Spot the line with the mistake.',
    icon: Bug,
    tone: 'text-hue-rose',
    bg: 'bg-hue-rose/10',
  },
  {
    type: 'DragDrop',
    name: 'Drag & Drop',
    blurb: 'Put scrambled lines back in order.',
    icon: ListOrdered,
    tone: 'text-hue-study',
    bg: 'bg-hue-study/10',
  },
  {
    type: 'CodeTrace',
    name: 'Code Trace',
    blurb: 'Run it in your head. What does it print?',
    icon: ScanSearch,
    tone: 'text-hue-insight',
    bg: 'bg-hue-insight/10',
  },
  {
    type: 'CodeFix',
    name: 'Code Fix',
    blurb: 'Rewrite the broken line so it works.',
    icon: Wrench,
    tone: 'text-hue-pair',
    bg: 'bg-hue-pair/10',
  },
];

/** "3d 4h", "5h 12m", "8m" - time until a reset, for a label. */
export function formatCountdown(until: string | Date | null | undefined, now = Date.now()): string {
  if (!until) return '';
  const ms = new Date(until).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) return 'now';

  const minutes = Math.floor(ms / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${Math.max(1, mins)}m`;
}

export const RESULT_KEY = 'codeguru.lastGameResult';
