import Link from 'next/link';
import {
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  Flame,
  Gamepad2,
  History,
  Medal,
  Play,
  Shield,
  Sparkles,
  Swords,
  Target,
  Trophy,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import { formatConcept, formatErrorType, formatGameType } from '@/lib/vocabulary';
import { relativeTime } from '@/lib/time';
import { FORMATS, type PlayerOverview } from '@/lib/arcade';
import { Badge, Card, EmptyState, SectionTitle, Unavailable, buttonClass } from '@/components/ui';
import { CountUp, Reveal } from '@/components/motion';
import { LockedPreview } from '@/components/pro';
import { FillBar, Ring } from '@/components/charts';
import {
  AchievementsGallery,
  Countdown,
  FreePlay,
  LeaderboardCard,
  QuestList,
} from '@/components/arcade';

/**
 * Practice home: the arcade.
 *
 * Built around the loop that keeps a player coming back - a level to climb,
 * a streak to keep, today's challenge, this week's quests, a leaderboard and
 * a wall of achievements - with the adaptive round the engine recommends still
 * the first thing to play. Every number here comes from the gamification
 * engine's reward service, which computes it from rounds it graded itself.
 *
 * Rendering only; page.tsx fetches. Each input is null when its call failed,
 * and the section that needs it says so rather than showing zeros.
 */

export interface Recommendation {
  recommendation_id: string;
  concept_tag: string;
  error_type?: string;
  game_type: string;
  title: string;
  rationale?: string;
  focus_points?: string[];
}

export interface GameSummary {
  game_session_id: string;
  concept: string;
  game_type?: string;
  difficulty_level?: string;
  score?: number;
  played_at?: string;
}

export type Catalog = Record<string, { conceptTag: string; questions: number }[]>;

export function PlayView({
  firstName,
  overview,
  recommendation,
  recommendationsLoaded,
  rounds,
  catalog,
  free = false,
}: {
  firstName: string;
  overview: PlayerOverview | null;
  recommendation: Recommendation | null;
  recommendationsLoaded: boolean;
  rounds: GameSummary[] | null;
  catalog: Catalog | null;
  /** On the Free plan: the daily challenge is open, free play and the leaderboard are locked. */
  free?: boolean;
}) {
  return (
    <div className="space-y-10">
      {overview ? (
        <PlayerHero firstName={firstName} overview={overview} />
      ) : (
        <>
          <Reveal>
            <h1 className="text-3xl font-extrabold tracking-tight text-ink">Practice</h1>
          </Reveal>
          <Unavailable what="Your player profile" />
        </>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          {overview && <DailyChallenge daily={overview.daily} />}
          <LockedPreview
            locked={free}
            title="Your next round"
            description="Rounds picked for your weakest concept are part of free play."
            from="practice"
          >
            <UpNext recommendation={recommendation} loaded={recommendationsLoaded} />
          </LockedPreview>
        </div>

        <section className="lg:col-span-2">
          <Reveal>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
                <Swords size={16} className="text-hue-play" aria-hidden />
                Weekly quests
              </h2>
              {overview && (
                <span className="text-sm text-muted">
                  New in <Countdown until={overview.quests.endsAt} className="font-semibold text-body" />
                </span>
              )}
            </div>
          </Reveal>
          {overview ? (
            <QuestList quests={overview.quests.items} />
          ) : (
            <Unavailable what="This week's quests" />
          )}
        </section>
      </div>

      <section>
        <Reveal>
          <SectionTitle hint="Any format, any concept">Free play</SectionTitle>
        </Reveal>
        {catalog ? (
          <Reveal>
            <LockedPreview
              locked={free}
              title="Free play"
              description="Play any of the four formats on any concept, as often as you like. The daily challenge stays free."
              from="practice"
            >
              <FreePlay catalog={catalog} suggestedConcept={recommendation?.concept_tag ?? null} />
            </LockedPreview>
          </Reveal>
        ) : (
          <Unavailable what="The game list" />
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <Reveal className="lg:col-span-3">
          {free ? (
            <LockedPreview
              locked
              title="Leaderboards"
              description="See where you rank this week, all time and on today's challenge."
              from="practice"
            >
              <LeaderboardPlaceholder />
            </LockedPreview>
          ) : (
            <LeaderboardCard initialVisible={overview?.player.showOnLeaderboard ?? true} />
          )}
        </Reveal>
        {overview && (
          <Reveal delay={80} className="lg:col-span-2">
            <LifetimeStats overview={overview} />
          </Reveal>
        )}
      </div>

      {overview && <AchievementsGallery achievements={overview.achievements} />}

      <RecentRounds rounds={rounds} />
    </div>
  );
}

/* ── The player ──────────────────────────────────────────────────────────── */

function PlayerHero({ firstName, overview }: { firstName: string; overview: PlayerOverview }) {
  const { level } = overview.player;
  const { streak, week } = overview;
  const unlocked = overview.achievements.filter((a) => a.unlocked).length;
  const initials = (overview.player.displayName ?? firstName)
    .replace('.', '')
    .split(/\s+/)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2);

  return (
    <Reveal
      as="section"
      className="relative overflow-hidden rounded-cg-xl border border-line bg-card p-6 shadow-cg-sm sm:p-8"
    >
      <div aria-hidden className="pointer-events-none absolute -left-24 -top-28 h-72 w-72 rounded-full bg-hue-play/25 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 -right-16 h-72 w-72 rounded-full bg-hue-rose/20 blur-3xl" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:radial-gradient(rgb(var(--cg-rgb-border-strong))_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_30%_40%,black,transparent_70%)]"
      />

      <div className="relative grid items-center gap-8 lg:grid-cols-[auto_minmax(0,1fr)_auto]">
        {/* Avatar inside the level ring: the ring is how far through this
            level they are. */}
        <div className="relative mx-auto">
          <Ring
            size={132}
            thickness={10}
            label={`Level ${level.level}, ${Math.round(level.progress * 100)}% of the way to level ${level.level + 1}`}
            segments={[
              { value: level.intoLevel, tone: 'text-hue-play', label: 'Earned' },
              { value: Math.max(0, level.toNext), tone: 'text-transparent', label: 'To go' },
            ]}
          >
            <span className="grid h-[92px] w-[92px] place-items-center rounded-full bg-gradient-to-br from-hue-play to-hue-rose text-3xl font-extrabold text-white shadow-cg-md">
              {initials || '?'}
            </span>
          </Ring>
          <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-line bg-card px-3 py-1 text-xs font-extrabold text-ink shadow-cg-sm">
            LV {level.level}
          </span>
        </div>

        <div className="min-w-0 text-center lg:text-left">
          <p className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-widest text-hue-play lg:justify-start">
            <Gamepad2 size={14} strokeWidth={2.4} aria-hidden />
            Practice
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink sm:text-[2.4rem] sm:leading-tight">
            {firstName}, <span className="cg-gradient-text">{level.title}</span>
          </h1>
          <p className="mt-2 text-body">
            Level {level.level} · <b className="text-ink">{level.xp.toLocaleString()}</b> XP in total
          </p>

          <div className="mx-auto mt-5 max-w-md lg:mx-0">
            <div className="mb-1.5 flex justify-between text-xs text-muted">
              <span className="tabular-nums">
                {level.intoLevel.toLocaleString()} / {level.levelSize.toLocaleString()} XP
              </span>
              <span>
                <b className="text-ink">{level.toNext.toLocaleString()}</b> to level {level.level + 1}
              </span>
            </div>
            <FillBar
              value={level.progress * 100}
              tone="bg-gradient-to-r from-hue-play to-hue-rose"
              label={`Progress to level ${level.level + 1}`}
              height="h-3"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 lg:w-[22rem]">
          <HeroStat
            icon={Flame}
            tone={streak.current > 0 ? 'text-hue-rose' : 'text-muted'}
            bg={streak.current > 0 ? 'bg-hue-rose/10' : 'bg-card-alt'}
            value={<CountUp value={streak.current} />}
            label="day streak"
            note={
              streak.playedToday
                ? 'Safe today'
                : streak.atRisk
                  ? streak.shieldWillBeUsed
                    ? 'Shield ready'
                    : 'Play today!'
                  : 'Start one'
            }
            alert={streak.atRisk && !streak.shieldWillBeUsed}
          />
          <HeroStat
            icon={Zap}
            tone="text-hue-play"
            bg="bg-hue-play/10"
            value={<CountUp value={week.xp} />}
            label="XP this week"
            note={week.rank ? `#${week.rank} of ${week.players}` : 'Not ranked yet'}
          />
          <HeroStat
            icon={Medal}
            tone="text-hue-study"
            bg="bg-hue-study/10"
            value={<CountUp value={unlocked} />}
            label="achievements"
            note={`of ${overview.achievements.length}`}
          />
        </div>
      </div>

      {streak.freezes > 0 && (
        <p className="relative mt-6 flex items-center justify-center gap-2 text-sm text-body lg:justify-start">
          <Shield size={15} className="text-hue-insight" aria-hidden />
          {streak.freezes} streak {streak.freezes === 1 ? 'shield' : 'shields'} — each one saves your streak if you miss a day.
        </p>
      )}
    </Reveal>
  );
}

function HeroStat({
  icon: Icon,
  tone,
  bg,
  value,
  label,
  note,
  alert = false,
}: {
  icon: LucideIcon;
  tone: string;
  bg: string;
  value: React.ReactNode;
  label: string;
  note: string;
  alert?: boolean;
}) {
  return (
    <div className="flex flex-col items-center rounded-cg-lg border border-line bg-card/70 px-2 py-4 text-center backdrop-blur">
      <span className={`grid h-9 w-9 place-items-center rounded-full ${bg} ${tone}`}>
        <Icon size={17} strokeWidth={2.3} aria-hidden />
      </span>
      <span className="mt-2 text-2xl font-extrabold tracking-tight text-ink">{value}</span>
      <span className="text-[11px] text-muted">{label}</span>
      <span className={`mt-1 text-[11px] font-semibold ${alert ? 'text-hue-rose' : 'text-body'}`}>{note}</span>
    </div>
  );
}

/* ── Daily challenge ─────────────────────────────────────────────────────── */

function DailyChallenge({ daily }: { daily: PlayerOverview['daily'] }) {
  const question = daily.question;
  const format = FORMATS.find((f) => f.type === question?.gameType);
  const FormatIcon = format?.icon ?? Target;

  return (
    <Reveal>
      <section className="relative overflow-hidden rounded-cg-xl border border-hue-play/30 bg-gradient-to-br from-hue-play/15 via-card to-hue-rose/10 p-6 shadow-cg-sm">
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-hue-play/25 blur-3xl" />

        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-hue-play">
              <CalendarCheck size={14} strokeWidth={2.4} aria-hidden />
              Daily challenge
            </p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-ink">
              {question ? (
                <>
                  {format?.name ?? formatGameType(question.gameType)}:{' '}
                  <span className="capitalize">{formatConcept(question.conceptTag)}</span>
                </>
              ) : (
                'No challenge today'
              )}
            </h2>
            <p className="mt-1 text-sm text-body">
              One question, the same for everyone. Your first try counts for{' '}
              <b className="text-ink">double XP</b> and a place on today&apos;s leaderboard.
            </p>
          </div>

          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-cg-lg bg-card/80 text-hue-play shadow-cg-sm">
            <FormatIcon size={26} strokeWidth={2.1} aria-hidden />
          </span>
        </div>

        <div className="relative mt-5 flex flex-wrap items-center gap-3">
          {daily.completed ? (
            <>
              <span className="inline-flex h-11 items-center gap-2 rounded-cg-sm bg-ok/15 px-4 text-sm font-bold text-ok">
                <CheckCircle2 size={17} aria-hidden />
                Done — {daily.completed.score} points, +{daily.completed.xp} XP
              </span>
              <Link href="/play/daily" className={buttonClass({ variant: 'secondary' })}>
                Play it again for practice
              </Link>
            </>
          ) : question ? (
            <Link
              href="/play/daily"
              className="cg-focusable inline-flex h-11 items-center gap-2 rounded-cg-sm bg-gradient-to-r from-hue-play to-hue-rose px-5 text-sm font-bold text-white shadow-cg-md transition hover:brightness-110"
            >
              <Play size={16} strokeWidth={2.6} aria-hidden />
              Play today&apos;s challenge
            </Link>
          ) : null}

          {question && <Badge tone="neutral">{question.difficulty}</Badge>}
          <span className="text-sm text-muted">
            New challenge in <Countdown until={daily.resetsAt} className="font-semibold text-body" />
          </span>
        </div>
      </section>
    </Reveal>
  );
}

/* ── Recommended round ───────────────────────────────────────────────────── */

function UpNext({ recommendation, loaded }: { recommendation: Recommendation | null; loaded: boolean }) {
  if (!loaded) return <Unavailable what="Your recommended round" />;

  if (!recommendation) {
    return (
      <Reveal>
        <EmptyState icon={Target} title="No round lined up for you yet">
          Write some Java with the Code Guru extension running. Repeat a mistake and a round aimed at
          it appears here. Free play below works any time.
        </EmptyState>
      </Reveal>
    );
  }

  return (
    <Reveal>
      <Card className="relative overflow-hidden p-6">
        <div aria-hidden className="pointer-events-none absolute -bottom-16 -right-10 h-40 w-40 rounded-full bg-hue-insight/15 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-cg bg-hue-insight/10 text-hue-insight">
              <Target size={20} strokeWidth={2.1} aria-hidden />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-hue-insight">Picked for you</p>
              <h3 className="mt-1 text-lg font-bold text-ink">{recommendation.title}</h3>
              <p className="mt-0.5 text-sm text-muted">
                <span className="font-medium capitalize text-body">{formatConcept(recommendation.concept_tag)}</span>
                {recommendation.error_type && <> · {formatErrorType(recommendation.error_type)}</>}
              </p>
            </div>
          </div>
        </div>

        {recommendation.rationale && (
          <p className="relative mt-4 text-sm text-body">{recommendation.rationale}</p>
        )}

        {recommendation.focus_points && recommendation.focus_points.length > 0 && (
          <ul className="relative mt-3 space-y-1.5">
            {recommendation.focus_points.slice(0, 3).map((point) => (
              <li key={point} className="flex gap-2 text-sm text-body">
                <Sparkles size={14} aria-hidden className="mt-0.5 shrink-0 text-hue-insight" />
                {point}
              </li>
            ))}
          </ul>
        )}

        {/*
          `auto`, not the recommendation's own difficulty: that arrives in
          Code Coach's vocabulary and would resolve without ever consulting
          the engine's adaptive model. `auto` lets the engine choose from
          this student's history.
        */}
        <Link
          href={`/play/${recommendation.game_type}/${recommendation.concept_tag}/auto?rec=${encodeURIComponent(recommendation.recommendation_id)}`}
          className={buttonClass({ size: 'lg', className: 'relative mt-5' })}
        >
          <Play size={17} strokeWidth={2.4} aria-hidden />
          Start {formatGameType(recommendation.game_type)}
          <ArrowRight size={16} aria-hidden />
        </Link>
      </Card>
    </Reveal>
  );
}

/* ── Lifetime stats ──────────────────────────────────────────────────────── */

/**
 * The leaderboard's shape behind the lock, for a Free student. Bars, not
 * names: the real board is not fetched (the proxy would refuse it), and a
 * made-up ranking with made-up students would be a fake record.
 */
function LeaderboardPlaceholder() {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <p className="font-bold text-ink">Leaderboard</p>
        <div className="flex gap-1">
          {['Week', 'All time', 'Today'].map((tab) => (
            <span key={tab} className="rounded-cg-sm bg-card-alt px-2.5 py-1 text-xs font-semibold text-muted">{tab}</span>
          ))}
        </div>
      </div>
      <div className="mt-6 flex items-end justify-center gap-4">
        {[64, 88, 52].map((height, i) => (
          <div key={i} className="flex w-20 flex-col items-center gap-2">
            <span className="h-10 w-10 rounded-full bg-card-alt" />
            <span className="w-full rounded-t-cg bg-hue-play/20" style={{ height }} />
          </div>
        ))}
      </div>
      <ul className="mt-5 space-y-2">
        {[4, 5, 6, 7].map((rank) => (
          <li key={rank} className="flex items-center gap-3 rounded-cg-sm bg-card-alt/60 px-3 py-2">
            <span className="w-5 text-xs font-bold text-muted">{rank}</span>
            <span className="h-2.5 flex-1 rounded-full bg-line" />
            <span className="h-2.5 w-12 rounded-full bg-line" />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function LifetimeStats({ overview }: { overview: PlayerOverview }) {
  const s = overview.stats;
  const items: Array<{ label: string; value: number; icon: LucideIcon; tone: string }> = [
    { label: 'Rounds played', value: s.rounds ?? 0, icon: Gamepad2, tone: 'text-hue-play' },
    { label: 'Perfect scores', value: s.perfects ?? 0, icon: Trophy, tone: 'text-hue-rose' },
    { label: 'Best perfect run', value: s.maxPerfectRun ?? 0, icon: Zap, tone: 'text-hue-insight' },
    { label: 'Longest streak', value: overview.streak.longest ?? 0, icon: Flame, tone: 'text-hue-rose' },
    { label: 'Concepts passed', value: s.conceptsPassed ?? 0, icon: Target, tone: 'text-hue-study' },
    { label: 'Daily challenges', value: s.dailyCompleted ?? 0, icon: CalendarCheck, tone: 'text-hue-pair' },
  ];

  return (
    <Card className="h-full p-5">
      <h2 className="font-semibold text-ink">Your record</h2>
      <p className="text-sm text-muted">
        {overview.allTime.rank
          ? `#${overview.allTime.rank} of ${overview.allTime.players} players all time`
          : 'Play a round to get on the board'}
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-cg bg-card-alt px-3.5 py-3">
              <Icon size={15} className={item.tone} aria-hidden />
              <dd className="mt-1.5 text-2xl font-extrabold tracking-tight text-ink">
                <CountUp value={item.value} />
              </dd>
              <dt className="text-xs text-muted">{item.label}</dt>
            </div>
          );
        })}
      </dl>
    </Card>
  );
}

/* ── History ─────────────────────────────────────────────────────────────── */

function RecentRounds({ rounds }: { rounds: GameSummary[] | null }) {
  return (
    <section>
      <Reveal>
        <SectionTitle hint={rounds?.length ? `${rounds.filter((r) => (r.score ?? 0) >= 70).length} of ${rounds.length} passed` : undefined}>
          Recent rounds
        </SectionTitle>
      </Reveal>

      {rounds === null ? (
        <Unavailable what="Your practice history" />
      ) : rounds.length === 0 ? (
        <Reveal>
          <EmptyState icon={History} title="Nothing played yet">
            Finish a round and it will be recorded here.
          </EmptyState>
        </Reveal>
      ) : (
        <Reveal>
          <Card className="divide-y divide-line overflow-hidden">
            {rounds.map((round, index) => {
              const score = Math.round(round.score ?? 0);
              const passed = score >= 70;
              return (
                <div key={round.game_session_id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium capitalize text-ink">{formatConcept(round.concept)}</p>
                    <p className="mt-0.5 text-sm text-muted">
                      {formatGameType(round.game_type)}
                      {round.difficulty_level && ` · ${round.difficulty_level}`}
                      {round.played_at && ` · ${relativeTime(round.played_at)}`}
                    </p>
                  </div>
                  <div className="w-28 shrink-0">
                    <FillBar
                      value={score}
                      tone={passed ? 'bg-ok' : 'bg-warn'}
                      label={`Score for ${formatConcept(round.concept)}`}
                      height="h-1.5"
                      delay={index * 40}
                    />
                  </div>
                  <span className={`w-10 shrink-0 text-right font-semibold tabular-nums ${passed ? 'text-ok' : 'text-warn'}`}>
                    {score}
                  </span>
                </div>
              );
            })}
          </Card>
        </Reveal>
      )}
    </section>
  );
}
