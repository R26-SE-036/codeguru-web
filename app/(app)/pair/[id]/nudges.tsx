'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import clsx from 'clsx';
import {
  Bell,
  Coffee,
  Lightbulb,
  type LucideIcon,
  MessageCircle,
  MousePointerClick,
  RefreshCw,
  Sparkles,
  ThumbsUp,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';

import { buttonClass } from '@/components/ui';

/**
 * How a nudge looks, and the parts of the page it points at.
 *
 * ======================= MADE TO BE NOTICED =======================
 * A nudge used to be one plain card above the editor, the same for every
 * state, which scrolled out of view as soon as the pair scrolled down to
 * work. Now:
 *
 *   - it sticks to the top of the screen until it is answered
 *   - each state has its own colour, icon and title, so "swap roles" and
 *     "you seem stuck" are told apart at a glance
 *   - it arrives with a short movement and a soft two-note chime (which the
 *     student can mute), and flashes the tab title if the tab is hidden
 *   - what it points at - the Switch roles button, the chat box, the
 *     Discussion panel - glows in the same colour, with a pulsing dot
 *   - a logic-struggle hint is part of the nudge, not a separate panel
 *   - every nudge of the session is kept in the Nudges list in the header
 *
 * The engine still decides only WHERE to draw attention and never sends
 * solution content; this changes how loudly it is drawn, not what is said.
 * Praise stays a small toast that leaves on its own: it should not interrupt
 * the flow it is praising.
 * ==================================================================
 */

/** Where to draw attention, and how. Never solution content. */
export interface Delivery {
  type?: string;
  uiTarget?: 'toast' | 'role_switch_button' | 'chat_input' | 'discussion_panel' | 'hint_panel' | 'none';
  uiEffect?: 'toast' | 'glow' | 'pulse' | 'highlight' | 'none';
  message?: string;
  audience?: 'pair' | 'driver' | 'navigator';
  autoDismissMs?: number;
}

export interface Intervention {
  id: string;
  state?: string;
  /** The model's confidence in `state`. */
  confidence?: number;
  action?: string;
  delivery?: Delivery;
  /** From a presenter-mode replay of a recorded window. */
  replay?: boolean;
}

/** The three-part scaffolded hint. Written by hand into the corpus, never generated. */
export interface RagHint {
  conceptReminder: string;
  exampleIdea: string;
  reflectiveQuestion: string;
  retrievedConcepts?: string[];
  fallbackUsed?: boolean;
}

export interface Look {
  label: string;
  title: string;
  icon: LucideIcon;
  /** For the CSS animations: `rgb(var(--cg-nudge-rgb) / a)`. */
  rgb: string;
  text: string;
  soft: string;
  border: string;
  solid: string;
}

/** One look per collaboration state. Class names are written out for Tailwind. */
export const NUDGE_LOOK: Record<string, Look> = {
  PRODUCTIVE: {
    label: 'Productive',
    title: 'Great teamwork',
    icon: Sparkles,
    rgb: 'var(--cg-rgb-ok)',
    text: 'text-ok',
    soft: 'bg-ok/10',
    border: 'border-ok/50',
    solid: 'bg-ok',
  },
  DRIVER_DOMINANCE: {
    label: 'Driver dominance',
    title: 'Time to swap roles?',
    icon: RefreshCw,
    rgb: 'var(--cg-rgb-warn)',
    text: 'text-warn',
    soft: 'bg-warn/10',
    border: 'border-warn/50',
    solid: 'bg-warn',
  },
  PASSIVE_NAVIGATOR: {
    label: 'Passive navigator',
    title: 'Navigator, jump in',
    icon: MessageCircle,
    rgb: 'var(--cg-rgb-accent)',
    text: 'text-accent',
    soft: 'bg-accent/10',
    border: 'border-accent/50',
    solid: 'bg-accent',
  },
  LOGIC_STRUGGLE: {
    label: 'Logic struggle',
    title: 'Stuck? Break it down',
    icon: Lightbulb,
    rgb: 'var(--cg-rgb-hue-rose)',
    text: 'text-hue-rose',
    soft: 'bg-hue-rose/10',
    border: 'border-hue-rose/50',
    solid: 'bg-hue-rose',
  },
  DISENGAGED: {
    label: 'Disengaged',
    title: 'Let’s regroup',
    icon: Coffee,
    rgb: 'var(--cg-rgb-hue-study)',
    text: 'text-hue-study',
    soft: 'bg-hue-study/10',
    border: 'border-hue-study/50',
    solid: 'bg-hue-study',
  },
};

const FALLBACK_LOOK: Look = { ...NUDGE_LOOK.PASSIVE_NAVIGATOR, label: 'A nudge', title: 'A nudge', icon: Bell };

export const lookOf = (state?: string): Look => NUDGE_LOOK[state ?? ''] ?? FALLBACK_LOOK;

/** The style that colours a nudge and everything it points at. */
export const nudgeColour = (state?: string) => ({ '--cg-nudge-rgb': lookOf(state).rgb }) as CSSProperties;

/** What on the page the nudge has lit up, in words. */
const TARGET_TEXT: Partial<Record<NonNullable<Delivery['uiTarget']>, string>> = {
  role_switch_button: 'The Switch roles button at the top is lit up.',
  chat_input: 'The chat box is lit up - say it there.',
  discussion_panel: 'The Discussion panel is lit up.',
};

/** A pulsing dot in the nudge's colour, on whatever the nudge points at. */
export function AttentionDot({ className }: { className?: string }) {
  return (
    <span aria-hidden className={clsx('pointer-events-none absolute flex h-3.5 w-3.5', className)}>
      <span
        className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70"
        style={{ background: 'rgb(var(--cg-nudge-rgb))' }}
      />
      <span
        className="relative inline-flex h-3.5 w-3.5 rounded-full ring-2 ring-card"
        style={{ background: 'rgb(var(--cg-nudge-rgb))' }}
      />
    </span>
  );
}

/** The nudge itself: sticky, coloured by state, until it is answered. */
export function NudgeCard({
  intervention,
  hint,
  sound,
  onToggleSound,
  onRespond,
}: {
  intervention: Intervention;
  hint: RagHint | null;
  sound: boolean;
  onToggleSound: () => void;
  onRespond: (accepted: boolean) => void;
}) {
  const look = lookOf(intervention.state);
  const Icon = look.icon;
  const target = intervention.delivery?.uiTarget;
  const targetText = target ? TARGET_TEXT[target] : undefined;
  const confidence = intervention.confidence;

  return (
    // Below the phone header, which is sticky too; at the very top on a desktop.
    <div className="sticky top-[4.25rem] z-30 lg:top-3">
      <section
        key={intervention.id}
        role="alert"
        style={nudgeColour(intervention.state)}
        className={clsx('cg-nudge relative overflow-hidden rounded-cg-lg border-2 bg-card shadow-cg-lg', look.border)}
      >
        <span aria-hidden className={clsx('absolute inset-y-0 left-0 w-1.5', look.solid)} />
        <div className="flex flex-wrap items-start gap-4 py-4 pl-6 pr-4 sm:flex-nowrap">
          <span
            className={clsx(
              'cg-nudge-icon grid h-12 w-12 shrink-0 place-items-center rounded-full',
              look.soft,
              look.text,
            )}
          >
            <Icon size={24} strokeWidth={2.2} aria-hidden />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className={clsx('text-[11px] font-bold uppercase tracking-wider', look.text)}>
                PairPath noticed: {look.label.toLowerCase()}
              </p>
              {typeof confidence === 'number' && (
                <span className="rounded-full bg-card-alt px-2 py-0.5 text-[11px] font-semibold text-muted ring-1 ring-line">
                  {Math.round(confidence * 100)}% sure
                </span>
              )}
              {intervention.replay && (
                <span className="rounded-full bg-card-alt px-2 py-0.5 text-[11px] font-semibold text-muted ring-1 ring-line">
                  replayed window
                </span>
              )}
              <button
                type="button"
                onClick={onToggleSound}
                aria-pressed={sound}
                aria-label={sound ? 'Mute the nudge sound' : 'Turn the nudge sound on'}
                title={sound ? 'Mute the nudge sound' : 'Turn the nudge sound on'}
                className="cg-focusable ml-auto grid h-7 w-7 place-items-center rounded-full text-muted transition hover:bg-card-alt hover:text-ink"
              >
                {sound ? <Volume2 size={15} aria-hidden /> : <VolumeX size={15} aria-hidden />}
              </button>
            </div>

            <h3 className="mt-0.5 text-lg font-bold leading-snug text-ink">{look.title}</h3>
            <p className="mt-1 leading-relaxed text-body">{intervention.delivery?.message}</p>

            {targetText && (
              <p className={clsx('mt-2 flex items-center gap-1.5 text-sm font-semibold', look.text)}>
                <MousePointerClick size={15} strokeWidth={2.2} aria-hidden />
                {targetText}
              </p>
            )}

            {hint && <HintBody hint={hint} />}
          </div>

          <div className="flex w-full shrink-0 gap-2 sm:w-auto sm:flex-col">
            <button
              type="button"
              onClick={() => onRespond(true)}
              className={buttonClass({ size: 'sm', className: 'flex-1 sm:flex-none' })}
            >
              <ThumbsUp size={14} strokeWidth={2.3} aria-hidden />
              Helpful
            </button>
            <button
              type="button"
              onClick={() => onRespond(false)}
              className={buttonClass({ variant: 'secondary', size: 'sm', className: 'flex-1 sm:flex-none' })}
            >
              <X size={14} strokeWidth={2.3} aria-hidden />
              Dismiss
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

/** The retrieved hint inside a struggle nudge, in the three parts the corpus is written in. */
function HintBody({ hint }: { hint: RagHint }) {
  return (
    <dl className="mt-3 grid gap-3 rounded-cg border border-line bg-card-alt p-3.5 text-sm sm:grid-cols-3">
      <div>
        <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Concept</dt>
        <dd className="mt-1 text-body">{hint.conceptReminder}</dd>
      </div>
      <div>
        <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Try this</dt>
        <dd className="mt-1 text-body">{hint.exampleIdea}</dd>
      </div>
      <div>
        <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Ask yourselves</dt>
        <dd className="mt-1 text-body">{hint.reflectiveQuestion}</dd>
      </div>
    </dl>
  );
}

/** Praise: a toast at the bottom of the screen that leaves by itself. */
export function NudgeToast({ intervention }: { intervention: Intervention }) {
  const look = lookOf(intervention.state);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
      <p
        role="status"
        className={clsx(
          'cg-nudge-toast pointer-events-auto flex max-w-xl items-center gap-3 rounded-full border-2 bg-card py-2.5 pl-2.5 pr-5 shadow-cg-lg',
          look.border,
        )}
      >
        <span className={clsx('grid h-9 w-9 shrink-0 place-items-center rounded-full', look.soft, look.text)}>
          <Sparkles size={18} strokeWidth={2.2} aria-hidden />
        </span>
        <span className="text-sm">
          <strong className={look.text}>{look.title}.</strong>{' '}
          <span className="text-body">{intervention.delivery?.message}</span>
        </span>
      </p>
    </div>
  );
}

/** One nudge as the session's list remembers it. */
export interface PastNudge {
  id: string;
  state?: string;
  message: string;
  at: number;
  replay?: boolean;
}

/** Every nudge this session, newest first - so one dismissed is not one lost. */
export function NudgeHistory({ items }: { items: PastNudge[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !box.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={buttonClass({ variant: 'secondary', size: 'sm' })}
      >
        <Bell size={14} strokeWidth={2.2} aria-hidden />
        Nudges
        {items.length > 0 && (
          <span className="rounded-full bg-hue-pair px-1.5 text-[11px] font-bold leading-5 text-on-accent">
            {items.length}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] animate-cg-menu overflow-hidden rounded-cg-lg border border-line bg-card shadow-cg-lg">
          <p className="border-b border-line px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-muted">
            Nudges this session
          </p>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted">
              None yet. PairPath nudges when it sees how the two of you are working.
            </p>
          ) : (
            <ul className="max-h-80 divide-y divide-line overflow-y-auto">
              {items.map((item) => {
                const look = lookOf(item.state);
                const Icon = look.icon;
                return (
                  <li key={item.id} className="flex gap-3 px-4 py-3">
                    <span className={clsx('mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full', look.soft, look.text)}>
                      <Icon size={14} strokeWidth={2.3} aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-baseline justify-between gap-2">
                        <span className={clsx('text-sm font-bold', look.text)}>{look.label}</span>
                        <span className="shrink-0 text-xs text-muted">
                          {new Date(item.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          {item.replay ? ' · replay' : ''}
                        </span>
                      </p>
                      <p className="mt-0.5 text-sm text-body">{item.message}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sound and the tab title ─────────────────────────────────────────────────

const SOUND_KEY = 'cg-pair-nudge-sound';

/** On unless the student muted it. Per browser, and only a convenience. */
export function useNudgeSound(): [boolean, () => void] {
  const [on, setOn] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem(SOUND_KEY) === 'off') setOn(false);
    } catch {
      // Storage blocked: the default stands.
    }
  }, []);
  const toggle = useCallback(() => {
    setOn((previous) => {
      const next = !previous;
      try {
        localStorage.setItem(SOUND_KEY, next ? 'on' : 'off');
      } catch {
        // Not remembered, still toggled.
      }
      return next;
    });
  }, []);
  return [on, toggle];
}

/**
 * A soft two-note chime, made on the spot - no audio file to load.
 *
 * Rising for a nudge, higher and brighter for praise. Quiet on purpose: it is
 * there to make someone look up, not to startle a lab.
 */
export function playChime(kind: 'nudge' | 'praise') {
  try {
    const Context =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    const context = new Context();
    const notes = kind === 'praise' ? [784, 1047] : [587, 880];
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      const start = context.currentTime + index * 0.15;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.45);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.5);
    });
    setTimeout(() => context.close().catch(() => {}), 1200);
  } catch {
    // No sound is not an error worth showing.
  }
}

/** While a nudge waits and the tab is hidden, the tab title says so. */
export function useTitleAlert(active: boolean, text: string) {
  useEffect(() => {
    if (!active) return;
    const original = document.title;
    let flip = false;
    const timer = setInterval(() => {
      if (!document.hidden) {
        document.title = original;
        return;
      }
      flip = !flip;
      document.title = flip ? `● ${text}` : original;
    }, 1000);
    return () => {
      clearInterval(timer);
      document.title = original;
    };
  }, [active, text]);
}
