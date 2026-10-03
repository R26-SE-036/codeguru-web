'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import {
  CheckCircle2,
  Crown,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Play,
  Shuffle,
  Timer,
  Trophy,
} from 'lucide-react';

import { api } from '@/lib/api';
import {
  FORMATS,
  TIER,
  formatCountdown,
  iconFor,
  type Achievement,
  type Leaderboard,
  type LeaderboardEntry,
  type Quest,
} from '@/lib/arcade';
import { formatConcept } from '@/lib/vocabulary';
import { Card } from '@/components/ui';
import { FillBar } from '@/components/charts';
import { Reveal } from '@/components/motion';

/**
 * The interactive pieces of the Practice home and the results screen.
 *
 * Client components because each one either changes on its own (a countdown),
 * fetches as the player switches tabs (the leaderboard), or holds a choice
 * (which game to play). Everything they show comes from the gamification
 * engine; nothing here decides a reward.
 */

/* ── Countdown ───────────────────────────────────────────────────────────── */

/**
 * Time until a reset, refreshed every half minute.
 *
 * Renders nothing on the server: the server's "now" and the browser's differ,
 * and a countdown that jumps on hydration looks broken.
 */
export function Countdown({ until, className }: { until: string | null | undefined; className?: string }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (!until || now === null) return <span className={className}>&nbsp;</span>;
  return <span className={clsx('tabular-nums', className)}>{formatCountdown(until, now)}</span>;
}

/* ── Confetti ────────────────────────────────────────────────────────────── */

const CONFETTI_COLOURS = [
  'bg-hue-play',
  'bg-hue-study',
  'bg-hue-insight',
  'bg-hue-pair',
  'bg-hue-rose',
  'bg-ok',
];

/**
 * One burst, for a level-up or a passed set. Plays once and is gone.
 *
 * The pieces are laid out deterministically from their index rather than
 * with Math.random, so the server and client render the same markup.
 */
export function Confetti({ pieces = 36 }: { pieces?: number }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-0 overflow-visible">
      {Array.from({ length: pieces }, (_, i) => {
        const angle = (i / pieces) * Math.PI * 2;
        const spread = 120 + ((i * 37) % 140);
        return (
          <span
            key={i}
            className={clsx('cg-confetti-piece', CONFETTI_COLOURS[i % CONFETTI_COLOURS.length])}
            style={{
              ['--cg-dx' as string]: `${Math.round(Math.cos(angle) * spread)}px`,
              ['--cg-dy' as string]: `${Math.round(160 + Math.abs(Math.sin(angle)) * 200)}px`,
              ['--cg-spin' as string]: `${(i % 2 ? 1 : -1) * (360 + ((i * 53) % 360))}deg`,
              ['--cg-delay' as string]: `${(i % 6) * 40}ms`,
            }}
          />
        );
      })}
    </div>
  );
}

/* ── Achievements ────────────────────────────────────────────────────────── */

export function AchievementTile({
  achievement,
  pop = false,
  delay = 0,
}: {
  achievement: Achievement;
  /** Animate in, for one that has just been unlocked. */
  pop?: boolean;
  delay?: number;
}) {
  const Icon = iconFor(achievement.icon);
  const tier = TIER[achievement.tier] ?? TIER.bronze;
  const locked = !achievement.unlocked;

  return (
    <div
      className={clsx(
        'relative flex h-full flex-col items-center overflow-hidden rounded-cg-lg border border-line bg-card p-4 text-center transition duration-200 ease-cg',
        locked ? 'bg-card-alt/50' : 'hover:-translate-y-0.5 hover:shadow-cg-md',
        pop && 'cg-pop',
      )}
      style={pop ? { ['--cg-delay' as string]: `${delay}ms` } : undefined}
    >
      {!locked && (
        <div
          aria-hidden
          className={clsx('pointer-events-none absolute -top-8 left-1/2 h-20 w-20 -translate-x-1/2 rounded-full blur-2xl', tier.glow)}
        />
      )}

      <span
        className={clsx(
          'relative grid h-12 w-12 place-items-center rounded-full ring-2',
          locked ? 'bg-card-alt text-muted ring-line' : clsx(tier.tile, tier.ring),
        )}
      >
        {locked ? <Lock size={18} aria-hidden /> : <Icon size={21} strokeWidth={2.1} aria-hidden />}
      </span>

      <p className={clsx('relative mt-3 text-sm font-bold', locked ? 'text-body' : 'text-ink')}>
        {achievement.title}
      </p>
      <p className="relative mt-0.5 text-xs text-muted">{achievement.description}</p>

      <div className="relative mt-auto w-full pt-3">
        {locked ? (
          <>
            <FillBar
              value={(achievement.current / achievement.target) * 100}
              tone="bg-hue-play"
              label={`${achievement.title}: ${achievement.current} of ${achievement.target}`}
              height="h-1.5"
            />
            <p className="mt-1 text-[11px] tabular-nums text-muted">
              {achievement.current} / {achievement.target}
            </p>
          </>
        ) : (
          <p className={clsx('text-[11px] font-semibold uppercase tracking-wider', tier.tile.split(' ')[1])}>
            {tier.label}
            {achievement.xp ? ` · +${achievement.xp} XP` : ''}
          </p>
        )}
      </div>
    </div>
  );
}

type AchievementFilter = 'all' | 'unlocked' | 'locked';

export function AchievementsGallery({ achievements }: { achievements: Achievement[] }) {
  const [filter, setFilter] = useState<AchievementFilter>('all');
  const [expanded, setExpanded] = useState(false);

  const unlocked = achievements.filter((a) => a.unlocked).length;

  // Unlocked first, then the locked ones nearest to done - the ones worth
  // chasing next should be the first locked tiles a player sees.
  const sorted = useMemo(
    () =>
      [...achievements].sort((a, b) => {
        if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
        return b.current / b.target - a.current / a.target;
      }),
    [achievements],
  );

  const shown = sorted.filter((a) =>
    filter === 'all' ? true : filter === 'unlocked' ? a.unlocked : !a.unlocked,
  );
  const visible = expanded ? shown : shown.slice(0, 10);

  return (
    <section>
      <Reveal>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <h2 className="text-base font-semibold text-ink">Achievements</h2>
            <span className="text-sm text-muted">
              <b className="font-semibold text-ink">{unlocked}</b> of {achievements.length} unlocked
            </span>
          </div>
          <Segmented
            value={filter}
            onChange={(next) => {
              setFilter(next);
              setExpanded(false);
            }}
            options={[
              { value: 'all', label: 'All' },
              { value: 'unlocked', label: 'Unlocked' },
              { value: 'locked', label: 'To earn' },
            ]}
          />
        </div>
        <div className="mb-4">
          <FillBar
            value={achievements.length ? (unlocked / achievements.length) * 100 : 0}
            tone="bg-gradient-to-r from-hue-play to-hue-rose"
            label={`${unlocked} of ${achievements.length} achievements unlocked`}
          />
        </div>
      </Reveal>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {visible.map((achievement, index) => (
          <Reveal key={achievement.id} delay={(index % 5) * 50}>
            <AchievementTile achievement={achievement} />
          </Reveal>
        ))}
      </div>

      {shown.length > 10 && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            className="cg-focusable rounded-cg-sm px-3 py-1.5 text-sm font-semibold text-accent hover:underline"
          >
            {expanded ? 'Show fewer' : `Show all ${shown.length}`}
          </button>
        </div>
      )}
    </section>
  );
}

/* ── Quests ──────────────────────────────────────────────────────────────── */

export function QuestList({ quests }: { quests: Quest[] }) {
  return (
    <ul className="space-y-3">
      {quests.map((quest, index) => {
        const Icon = iconFor(quest.icon);
        const done = quest.complete;

        return (
          <Reveal as="li" key={quest.id} delay={index * 60}>
            <div
              className={clsx(
                'flex items-center gap-3.5 rounded-cg-lg border p-3.5 transition',
                done ? 'border-ok/30 bg-ok/5' : 'border-line bg-card',
              )}
            >
              <span
                className={clsx(
                  'grid h-10 w-10 shrink-0 place-items-center rounded-cg',
                  done ? 'bg-ok/15 text-ok' : 'bg-hue-play/10 text-hue-play',
                )}
              >
                {done ? <CheckCircle2 size={19} aria-hidden /> : <Icon size={18} strokeWidth={2.2} aria-hidden />}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-ink">{quest.title}</p>
                  <span
                    className={clsx(
                      'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold',
                      done ? 'bg-ok/15 text-ok' : 'bg-hue-play/15 text-hue-play',
                    )}
                  >
                    {done ? 'Done' : `+${quest.xp} XP`}
                  </span>
                </div>
                <p className="truncate text-xs text-muted">{quest.description}</p>
                <div className="mt-2 flex items-center gap-2.5">
                  <FillBar
                    value={(quest.current / quest.target) * 100}
                    tone={done ? 'bg-ok' : 'bg-hue-play'}
                    label={`${quest.title}: ${quest.current} of ${quest.target}`}
                    height="h-1.5"
                    delay={index * 60}
                  />
                  <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted">
                    {quest.current}/{quest.target}
                  </span>
                </div>
              </div>
            </div>
          </Reveal>
        );
      })}
    </ul>
  );
}

/* ── Free play ───────────────────────────────────────────────────────────── */

/**
 * Pick any format and any concept the bank has questions for.
 *
 * The recommended round is the engine's choice; this is the student's. Both
 * still go through the adaptive difficulty (`auto`), so free play is not a
 * way to farm XP on Beginner questions - the level follows the player.
 */
export function FreePlay({
  catalog,
  suggestedConcept,
}: {
  catalog: Record<string, { conceptTag: string; questions: number }[]>;
  suggestedConcept?: string | null;
}) {
  const formats = FORMATS.filter((format) => (catalog[format.type] ?? []).length > 0);
  const [format, setFormat] = useState(formats[0]?.type ?? 'BugHunt');
  const concepts = catalog[format] ?? [];
  const [concept, setConcept] = useState<string | null>(null);

  const selected =
    concepts.find((c) => c.conceptTag === concept)?.conceptTag ??
    concepts.find((c) => c.conceptTag === suggestedConcept)?.conceptTag ??
    concepts[0]?.conceptTag ??
    null;

  const surprise = () => {
    if (!concepts.length) return;
    const others = concepts.filter((c) => c.conceptTag !== selected);
    const pool = others.length ? others : concepts;
    setConcept(pool[Math.floor(Math.random() * pool.length)].conceptTag);
  };

  if (!formats.length) return null;

  const active = FORMATS.find((f) => f.type === format) ?? FORMATS[0];

  return (
    <Card className="overflow-hidden">
      <div role="tablist" aria-label="Game format" className="grid grid-cols-2 border-b border-line sm:grid-cols-4">
        {formats.map((item) => {
          const Icon = item.icon;
          const on = item.type === format;
          return (
            <button
              key={item.type}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => {
                setFormat(item.type);
                setConcept(null);
              }}
              className={clsx(
                'cg-focusable group relative flex items-center gap-3 px-4 py-4 text-left transition',
                on ? 'bg-card-alt' : 'hover:bg-card-alt/60',
              )}
            >
              <span
                className={clsx(
                  'grid h-10 w-10 shrink-0 place-items-center rounded-cg transition duration-200 ease-cg group-hover:scale-110',
                  item.bg,
                  item.tone,
                )}
              >
                <Icon size={19} strokeWidth={2.2} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-ink">{item.name}</span>
                <span className="block truncate text-xs text-muted">
                  {(catalog[item.type] ?? []).length} concepts
                </span>
              </span>
              {on && (
                <span aria-hidden className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-hue-play" />
              )}
            </button>
          );
        })}
      </div>

      <div className="p-5 sm:p-6">
        <p className="text-sm text-body">{active.blurb}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          {concepts.map((item) => {
            const on = item.conceptTag === selected;
            return (
              <button
                key={item.conceptTag}
                type="button"
                onClick={() => setConcept(item.conceptTag)}
                aria-pressed={on}
                className={clsx(
                  'cg-focusable rounded-full border px-3.5 py-1.5 text-sm font-medium capitalize transition',
                  on
                    ? 'border-hue-play/50 bg-hue-play/15 text-ink'
                    : 'border-line bg-card text-body hover:border-line-strong',
                )}
              >
                {formatConcept(item.conceptTag)}
                {item.conceptTag === suggestedConcept && (
                  <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wider text-hue-play">for you</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {selected && (
            <Link
              href={`/play/${format}/${selected}/auto`}
              className="cg-focusable inline-flex h-11 items-center gap-2 rounded-cg-sm bg-gradient-to-r from-hue-play to-hue-rose px-5 text-sm font-bold text-white shadow-cg-md transition hover:brightness-110"
            >
              <Play size={16} strokeWidth={2.6} aria-hidden />
              Play {active.name}: <span className="capitalize">{formatConcept(selected)}</span>
            </Link>
          )}
          <button
            type="button"
            onClick={surprise}
            className="cg-focusable inline-flex h-11 items-center gap-2 rounded-cg-sm border border-line bg-card px-4 text-sm font-semibold text-ink transition hover:border-line-strong hover:bg-card-alt"
          >
            <Shuffle size={15} aria-hidden />
            Surprise me
          </button>
          <span className="text-xs text-muted">5 questions · difficulty adapts to you</span>
        </div>
      </div>
    </Card>
  );
}

/* ── Leaderboard ─────────────────────────────────────────────────────────── */

type Period = 'week' | 'all' | 'today';

const PERIOD_LABEL: Record<Period, string> = {
  week: 'This week',
  all: 'All time',
  today: "Today's challenge",
};

export function LeaderboardCard({
  initialVisible,
}: {
  initialVisible: boolean;
}) {
  const [period, setPeriod] = useState<Period>('week');
  const [boards, setBoards] = useState<Partial<Record<Period, Leaderboard | 'error'>>>({});
  const [visible, setVisible] = useState(initialVisible);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (boards[period]) return;
    let live = true;
    api
      .get<Leaderboard>('play', `/leaderboard?period=${period}&limit=10`)
      .then((board) => live && setBoards((all) => ({ ...all, [period]: board })))
      .catch(() => live && setBoards((all) => ({ ...all, [period]: 'error' })));
    return () => {
      live = false;
    };
  }, [period, boards]);

  async function toggleVisibility() {
    setSaving(true);
    try {
      const next = await api.patch<{ showOnLeaderboard: boolean }>('play', '/me/preferences', {
        showOnLeaderboard: !visible,
      });
      setVisible(next.showOnLeaderboard);
      setBoards({});
    } catch {
      // Left as it was; the switch simply does not move.
    } finally {
      setSaving(false);
    }
  }

  const board = boards[period];
  const unit = period === 'today' ? 'pts' : 'XP';

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <h2 className="flex items-center gap-2 font-semibold text-ink">
          <Trophy size={17} className="text-hue-play" aria-hidden />
          Leaderboard
        </h2>
        <Segmented
          value={period}
          onChange={setPeriod}
          options={(Object.keys(PERIOD_LABEL) as Period[]).map((value) => ({
            value,
            label: PERIOD_LABEL[value],
          }))}
        />
      </div>

      <div className="flex-1 p-5">
        {!board ? (
          <div className="grid h-48 place-items-center text-muted">
            <Loader2 size={20} className="animate-spin" aria-label="Loading the leaderboard" />
          </div>
        ) : board === 'error' ? (
          <p className="py-10 text-center text-sm text-muted">The leaderboard is unavailable right now.</p>
        ) : board.entries.length === 0 ? (
          <div className="py-10 text-center">
            <Trophy size={28} className="mx-auto text-faint-nontext" aria-hidden />
            <p className="mt-3 font-semibold text-ink">
              {period === 'today' ? 'Nobody has played today’s challenge yet' : 'No scores yet this time'}
            </p>
            <p className="mt-1 text-sm text-muted">Play a round and claim the top spot.</p>
          </div>
        ) : (
          <>
            <Podium entries={board.entries.slice(0, 3)} unit={unit} />

            {board.entries.length > 3 && (
              <ol className="mt-5 space-y-1.5">
                {board.entries.slice(3).map((entry) => (
                  <LeaderRow key={entry.rank} entry={entry} unit={unit} />
                ))}
              </ol>
            )}

            {board.you && board.you.rank > board.entries.length && (
              <>
                <div aria-hidden className="my-2 text-center text-xs text-muted">
                  ···
                </div>
                <ol>
                  <LeaderRow entry={board.you} unit={unit} />
                </ol>
              </>
            )}
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-card-alt/50 px-5 py-3 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <Timer size={13} aria-hidden />
          {board && board !== 'error' && board.resetsAt ? (
            <>
              Resets in <Countdown until={board.resetsAt} className="font-semibold text-body" />
            </>
          ) : (
            'Total XP, all time'
          )}
        </span>
        <button
          type="button"
          onClick={toggleVisibility}
          disabled={saving}
          className="cg-focusable inline-flex items-center gap-1.5 rounded-cg-sm px-2 py-1 font-semibold text-body transition hover:bg-card hover:text-ink"
        >
          {visible ? <Eye size={13} aria-hidden /> : <EyeOff size={13} aria-hidden />}
          {visible ? 'Your name is shown' : 'You appear as Anonymous'}
        </button>
      </div>
    </Card>
  );
}

/** First, second and third, as a podium: second left, first centre, third right. */
function Podium({ entries, unit }: { entries: LeaderboardEntry[]; unit: string }) {
  const order = [entries[1], entries[0], entries[2]];
  const heights = ['h-16', 'h-24', 'h-12'];
  const tones = [
    'from-hue-insight/40 to-hue-insight/10',
    'from-hue-play/50 to-hue-play/10',
    'from-hue-rose/40 to-hue-rose/10',
  ];

  return (
    <ol className="grid grid-cols-3 items-end gap-3">
      {order.map((entry, slot) =>
        entry ? (
          <li key={entry.rank} className="flex flex-col items-center text-center">
            <div className="relative">
              {entry.rank === 1 && (
                <Crown
                  size={20}
                  aria-hidden
                  className="absolute -top-5 left-1/2 -translate-x-1/2 text-hue-play"
                />
              )}
              <span
                className={clsx(
                  'grid h-12 w-12 place-items-center rounded-full text-sm font-bold text-white ring-2',
                  entry.you ? 'bg-cg-brand ring-accent' : 'bg-cg-accent ring-card',
                )}
              >
                {entry.initials}
              </span>
            </div>
            <p className="mt-2 w-full truncate text-sm font-semibold text-ink">
              {entry.you ? 'You' : entry.name}
            </p>
            <p className="text-xs tabular-nums text-muted">
              {entry.value.toLocaleString()} {unit} · Lv {entry.level}
            </p>
            <div
              className={clsx(
                'mt-2 grid w-full place-items-center rounded-t-cg bg-gradient-to-b text-lg font-extrabold text-ink',
                heights[slot],
                tones[slot],
              )}
            >
              {entry.rank}
            </div>
          </li>
        ) : (
          <li key={`empty-${slot}`} />
        ),
      )}
    </ol>
  );
}

function LeaderRow({ entry, unit }: { entry: LeaderboardEntry; unit: string }) {
  return (
    <li
      className={clsx(
        'flex items-center gap-3 rounded-cg px-3 py-2',
        entry.you ? 'bg-accent/10 ring-1 ring-inset ring-accent/30' : 'hover:bg-card-alt/60',
      )}
    >
      <span className="w-6 shrink-0 text-right font-mono text-sm font-bold text-muted">{entry.rank}</span>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-card-alt text-xs font-bold text-body ring-1 ring-line">
        {entry.initials}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
        {entry.you ? `${entry.name} (you)` : entry.name}
      </span>
      <span className="shrink-0 text-xs text-muted">Lv {entry.level}</span>
      <span className="w-20 shrink-0 text-right text-sm font-semibold tabular-nums text-ink">
        {entry.value.toLocaleString()} <span className="text-xs font-normal text-muted">{unit}</span>
      </span>
    </li>
  );
}

/* ── Segmented control ───────────────────────────────────────────────────── */

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div role="tablist" className="inline-flex flex-wrap gap-0.5 rounded-cg-sm border border-line bg-card-alt p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          onClick={() => onChange(option.value)}
          className={clsx(
            'cg-focusable rounded-[7px] px-3 py-1 text-xs font-semibold transition',
            option.value === value ? 'bg-card text-ink shadow-cg-xs' : 'text-muted hover:text-ink',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
