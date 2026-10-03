'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import {
  ArrowLeft,
  CalendarCheck,
  CircleCheck,
  Clock3,
  Flame,
  Gamepad2,
  Lightbulb,
  RotateCcw,
  Shield,
  Sparkles,
  Swords,
  Target,
  TriangleAlert,
} from 'lucide-react';

import { formatConcept, formatGameType } from '@/lib/vocabulary';
import { RESULT_KEY, type RoundRewards } from '@/lib/arcade';
import { Badge, Card, buttonClass } from '@/components/ui';
import { CountUp, Reveal } from '@/components/motion';
import { FillBar } from '@/components/charts';
import { AchievementTile, Confetti } from '@/components/arcade';

/**
 * The end of a set: the score, and everything it earned.
 *
 * The game player writes the result to sessionStorage and this page reads it
 * once - Next has no route state, and a score in the URL invites editing it.
 * sessionStorage rather than localStorage because it should not outlive the tab.
 *
 * The rewards were all decided by the engine as each round was submitted;
 * this page only adds them up and celebrates them.
 */

/** One finished round of a run. */
interface RunEntry {
  score: number;
  gameType: string;
  difficulty: string;
  seconds: number;
  hintLevel: number;
  attemptCount: number;
  rewards?: RoundRewards | null;
}

interface StoredResult {
  result: { score: number; learnerFeedback?: string; explanation?: string; rewards?: RoundRewards | null };
  conceptTag: string;
  mode?: 'practice' | 'daily';
  gameType: string;
  difficulty: string;
  attemptCount: number;
  hintLevel: number;
  seconds: number;

  /**
   * Every round of the run, oldest first. Optional: a result written by an
   * older build has none, and the single-round view below is still correct.
   */
  run?: RunEntry[];
}

export default function ResultsPage() {
  const [stored, setStored] = useState<StoredResult | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(RESULT_KEY);
      if (raw) setStored(JSON.parse(raw));
    } catch {
      // Private mode, cleared storage, or a shape from an older build. An
      // unreadable result is the same as no result.
    } finally {
      setReady(true);
    }
  }, []);

  const earned = useMemo(() => summarise(stored), [stored]);

  // Rendering the empty state before the effect runs would flash "nothing to
  // show" on every successful game.
  if (!ready) return null;

  if (!stored) {
    return (
      <div className="mx-auto max-w-xl">
        <Card className="px-6 py-12 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-cg-lg bg-hue-play/10 text-hue-play">
            <Target size={22} strokeWidth={2} aria-hidden />
          </span>
          <h1 className="mt-4 text-lg font-bold text-ink">No recent result</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-body">
            Finish a practice round and your score will appear here.
          </p>
          <Link href="/play" className={buttonClass({ variant: 'secondary', className: 'mt-6' })}>
            <ArrowLeft size={16} strokeWidth={2.2} aria-hidden />
            Back to practice
          </Link>
        </Card>
      </div>
    );
  }

  // A run of one is a round, and reads better as one.
  const run = (stored.run ?? []).length > 1 ? stored.run! : null;

  // For a run the headline is the AVERAGE, not the last round. The last round
  // of five is not what the student just did.
  const score = run
    ? Math.round(run.reduce((total, entry) => total + entry.score, 0) / run.length)
    : stored.result.score;
  const passed = score >= 70;
  const daily = stored.mode === 'daily';
  const celebrate = passed || Boolean(earned?.leveledUp);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* ── The headline ───────────────────────────────────────────────── */}
      <Card className="relative overflow-hidden px-6 pb-8 pt-10 text-center">
        {celebrate && <Confetti />}
        <div
          aria-hidden
          className={clsx(
            'pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full blur-3xl',
            passed ? 'bg-ok/20' : 'bg-warn/20',
          )}
        />
        <div aria-hidden className="pointer-events-none absolute -bottom-20 -right-10 h-48 w-48 rounded-full bg-hue-play/20 blur-3xl" />

        <div className="relative">
          <div className="flex flex-wrap justify-center gap-2">
            {daily && (
              <Badge tone="warn">
                <CalendarCheck size={12} aria-hidden />
                Daily challenge
              </Badge>
            )}
            {!run && <Badge tone="accent">{formatGameType(stored.gameType)}</Badge>}
            <Badge tone="neutral">
              <span className="capitalize">{formatConcept(stored.conceptTag)}</span>
            </Badge>
            {!run && <Badge tone="neutral">{stored.difficulty}</Badge>}
          </div>

          <span
            className={clsx(
              'mx-auto mt-6 grid h-14 w-14 place-items-center rounded-cg-lg',
              passed ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn',
            )}
          >
            {passed ? <CircleCheck size={26} strokeWidth={2} aria-hidden /> : <TriangleAlert size={26} strokeWidth={2} aria-hidden />}
          </span>

          <p className="mt-4 text-6xl font-extrabold tracking-tight text-ink">
            <CountUp value={score} />
          </p>
          <p className="mt-1 font-medium text-body">
            {run
              ? `${passed ? 'Solid set!' : 'Worth another go at this concept.'} Average over ${run.length} questions.`
              : passed
                ? 'Solid work!'
                : 'Worth another go at this one.'}
          </p>

          {earned && (
            <>
              <p className="cg-float-up mx-auto mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-hue-play to-hue-rose px-5 py-2 text-xl font-extrabold text-white shadow-cg-md">
                <Sparkles size={18} aria-hidden />+<CountUp value={earned.xp} /> XP
              </p>

              <div className="mx-auto mt-6 max-w-sm text-left">
                {earned.leveledUp && (
                  <p className="cg-pop mb-3 text-center text-sm font-extrabold uppercase tracking-widest text-hue-play">
                    Level up! You are now level {earned.level.level}
                  </p>
                )}
                <div className="mb-1.5 flex justify-between text-xs text-muted">
                  <span>
                    Level <b className="text-ink">{earned.level.level}</b> · {earned.level.title}
                  </span>
                  <span>
                    <b className="text-ink">{earned.level.toNext}</b> XP to level {earned.level.level + 1}
                  </span>
                </div>
                <FillBar
                  value={earned.level.progress * 100}
                  tone="bg-gradient-to-r from-hue-play to-hue-rose"
                  label={`Progress to level ${earned.level.level + 1}`}
                  height="h-3"
                />
              </div>
            </>
          )}
        </div>
      </Card>

      {(stored.result.learnerFeedback || stored.result.explanation) && (
        <Reveal>
          <Card className="flex gap-4 border-l-4 border-l-accent p-5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-cg bg-accent/10 text-accent">
              <Sparkles size={18} strokeWidth={2.2} aria-hidden />
            </span>
            <p className="text-body">{stored.result.learnerFeedback ?? stored.result.explanation}</p>
          </Card>
        </Reveal>
      )}

      {/* ── Unlocked ───────────────────────────────────────────────────── */}
      {earned && earned.achievements.length > 0 && (
        <section>
          <h2 className="mb-3 text-center text-sm font-extrabold uppercase tracking-widest text-hue-play">
            Achievement{earned.achievements.length === 1 ? '' : 's'} unlocked
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {earned.achievements.map((achievement, index) => (
              <AchievementTile key={achievement.id} achievement={achievement} pop delay={300 + index * 150} />
            ))}
          </div>
        </section>
      )}

      {/* ── Where the XP came from ─────────────────────────────────────── */}
      {earned && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Reveal>
            <Card className="h-full p-5">
              <h2 className="flex items-center gap-2 font-bold text-ink">
                <Sparkles size={16} className="text-hue-play" aria-hidden />
                Where your XP came from
              </h2>
              <ul className="mt-3 space-y-1.5 text-sm">
                {earned.lines.map((line) => (
                  <li key={line.label} className="flex justify-between gap-3">
                    <span className="text-body">{line.label}</span>
                    <span className="font-semibold tabular-nums text-ink">+{line.amount}</span>
                  </li>
                ))}
                <li className="flex justify-between gap-3 border-t border-line pt-2 font-bold">
                  <span className="text-ink">Total</span>
                  <span className="tabular-nums text-hue-play">+{earned.xp} XP</span>
                </li>
              </ul>
            </Card>
          </Reveal>

          <Reveal delay={80}>
            <Card className="h-full space-y-4 p-5">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-hue-rose/10 text-hue-rose">
                  <Flame size={19} aria-hidden />
                </span>
                <div>
                  <p className="font-bold text-ink">{earned.streak.current}-day streak</p>
                  <p className="text-xs text-muted">
                    {earned.streak.freezeUsed
                      ? 'A shield saved your streak from a missed day.'
                      : earned.streak.extended
                        ? 'Extended today. Come back tomorrow to keep it going.'
                        : 'Already counted today. See you tomorrow.'}
                  </p>
                </div>
              </div>

              {earned.streak.freezeEarned && (
                <p className="flex items-center gap-2 text-sm text-body">
                  <Shield size={15} className="text-hue-insight" aria-hidden />
                  You earned a streak shield.
                </p>
              )}

              {earned.quests.length > 0 ? (
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <Swords size={15} className="text-hue-play" aria-hidden />
                    Quests completed
                  </p>
                  <ul className="mt-1.5 space-y-1 text-sm">
                    {earned.quests.map((quest) => (
                      <li key={quest.id} className="flex justify-between gap-2">
                        <span className="text-body">{quest.title}</span>
                        <span className="font-semibold text-ok">+{quest.xp}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                earned.nextQuest && (
                  <div>
                    <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                      <Swords size={15} className="text-hue-play" aria-hidden />
                      Closest quest: {earned.nextQuest.title}
                    </p>
                    <div className="mt-2 flex items-center gap-2.5">
                      <FillBar
                        value={(earned.nextQuest.current / earned.nextQuest.target) * 100}
                        tone="bg-hue-play"
                        label={`${earned.nextQuest.title}: ${earned.nextQuest.current} of ${earned.nextQuest.target}`}
                        height="h-1.5"
                      />
                      <span className="shrink-0 text-xs tabular-nums text-muted">
                        {earned.nextQuest.current}/{earned.nextQuest.target}
                      </span>
                    </div>
                  </div>
                )
              )}
            </Card>
          </Reveal>
        </div>
      )}

      {/* ── The set, round by round ────────────────────────────────────── */}
      {run ? (
        <>
          <Reveal>
            <Card className="p-5">
              <div className="flex items-baseline justify-between">
                <h2 className="font-bold text-ink">This set</h2>
                <p className="text-sm text-muted">
                  {run.filter((entry) => entry.score >= 70).length} of {run.length} passed
                </p>
              </div>

              <ul className="mt-4 space-y-2.5">
                {run.map((entry, index) => (
                  <li key={index} className="flex items-center gap-3">
                    <span className="w-5 shrink-0 text-right text-sm tabular-nums text-muted">{index + 1}</span>
                    <span className="w-24 shrink-0 truncate text-sm text-body">{formatGameType(entry.gameType)}</span>
                    <span className="hidden w-24 shrink-0 truncate text-sm text-muted sm:block">{entry.difficulty}</span>
                    <span className="min-w-0 flex-1">
                      <FillBar
                        value={entry.score}
                        tone={entry.score >= 70 ? 'bg-ok' : 'bg-warn'}
                        label={`Round ${index + 1} score`}
                        height="h-1.5"
                        delay={index * 70}
                      />
                    </span>
                    <span className="w-9 shrink-0 text-right text-sm font-semibold tabular-nums text-ink">
                      {entry.score}
                    </span>
                    {entry.rewards && (
                      <span className="w-16 shrink-0 text-right text-xs font-semibold tabular-nums text-hue-play">
                        +{entry.rewards.xp.total} XP
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          </Reveal>

          <dl className="grid grid-cols-3 gap-3">
            <Stat icon={RotateCcw} label="Attempts" value={run.reduce((total, entry) => total + entry.attemptCount, 0)} />
            <Stat icon={Lightbulb} label="Hints used" value={run.reduce((total, entry) => total + entry.hintLevel, 0)} />
            <Stat icon={Clock3} label="Time" value={`${run.reduce((total, entry) => total + entry.seconds, 0)}s`} />
          </dl>
        </>
      ) : (
        <dl className="grid grid-cols-3 gap-3">
          <Stat icon={RotateCcw} label="Attempts" value={stored.attemptCount} />
          <Stat icon={Lightbulb} label="Hints used" value={`${stored.hintLevel}/3`} />
          <Stat icon={Clock3} label="Time" value={`${stored.seconds}s`} />
        </dl>
      )}

      <div className="flex flex-wrap justify-center gap-3">
        <Link
          href="/play"
          className="cg-focusable inline-flex h-12 items-center gap-2 rounded-cg-sm bg-gradient-to-r from-hue-play to-hue-rose px-6 text-base font-bold text-white shadow-cg-md transition hover:brightness-110"
        >
          <Gamepad2 size={18} aria-hidden />
          Keep playing
        </Link>
        <Link href="/study" className={buttonClass({ variant: 'secondary', size: 'lg' })}>
          Study this concept
        </Link>
      </div>
    </div>
  );
}

/**
 * Add up what every round of the set earned.
 *
 * XP lines with the same label are merged across rounds ("Score +410"), and
 * achievements and quests each get a line of their own, so the receipt adds
 * up to the total at the top. Null for a result from before rewards existed.
 */
function summarise(stored: StoredResult | null) {
  if (!stored) return null;

  const rounds = (stored.run?.length ? stored.run.map((entry) => entry.rewards) : [stored.result.rewards]).filter(
    (r): r is RoundRewards => Boolean(r),
  );
  if (!rounds.length) return null;

  const lines = new Map<string, number>();
  const add = (label: string, amount: number) => lines.set(label, (lines.get(label) ?? 0) + amount);

  for (const round of rounds) {
    for (const line of round.xp.round.lines) {
      // Streak lines carry the day count; merged under one label.
      add(/-day streak$/.test(line.label) ? 'Streak bonus' : line.label, line.amount);
    }
    for (const achievement of round.achievements) add(`Achievement: ${achievement.title}`, achievement.xp ?? 50);
    for (const quest of round.questsCompleted) add(`Quest: ${quest.title}`, quest.xp);
  }

  const last = rounds[rounds.length - 1];
  const first = rounds[0];
  const quests = rounds.flatMap((r) => r.questsCompleted);
  const nextQuest =
    [...last.quests]
      .filter((q) => !q.complete)
      .sort((a, b) => b.current / b.target - a.current / a.target)[0] ?? null;

  return {
    xp: rounds.reduce((sum, round) => sum + round.xp.total, 0),
    lines: [...lines].map(([label, amount]) => ({ label, amount })),
    level: last.level,
    leveledUp: last.level.level > first.level.before,
    streak: {
      ...last.streak,
      extended: rounds.some((r) => r.streak.extended),
      freezeUsed: rounds.some((r) => r.streak.freezeUsed),
      freezeEarned: rounds.some((r) => r.streak.freezeEarned),
    },
    achievements: rounds.flatMap((r) => r.achievements),
    quests,
    nextQuest,
  };
}

function Stat({ icon: Icon, label, value }: { icon: typeof Clock3; label: string; value: string | number }) {
  return (
    <Card className="p-4 text-center">
      <Icon size={16} strokeWidth={2.2} aria-hidden className="mx-auto text-muted" />
      <dd className="mt-2 text-xl font-bold tabular-nums text-ink">{value}</dd>
      <dt className="mt-0.5 text-xs text-muted">{label}</dt>
    </Card>
  );
}
