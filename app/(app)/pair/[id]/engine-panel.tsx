'use client';

import clsx from 'clsx';
import { BrainCircuit, History, Play, Power, Radio } from 'lucide-react';

import { buttonClass } from '@/components/ui';

import { NUDGE_LOOK, lookOf } from './nudges';

/**
 * Presenter mode: the ML engine, live, beside the session it is reading.
 *
 * Opened with ?presenter=1 on a session, for showing PairPath to a panel - see
 * presenter.ts in the PairPath API for what the mode changes and why. Each
 * prediction appears here as it is made, whether or not it became a nudge:
 * the state, all five probabilities against the confidence gate, the
 * features the model read, and what the engine decided. The replay buttons
 * run a held-out recorded window per state through the same engine, so the
 * five nudges can be shown in a minute.
 */

export interface PredictionReport {
  source: 'live' | 'replay';
  at: string;
  decision: 'sent' | 'below_gate' | 'no_action' | 'cooldown' | 'target_offline' | 'too_few_events' | 'unavailable';
  eventCount: number;
  state?: string;
  confidence?: number;
  probabilities?: Record<string, number> | null;
  modelVersion?: string;
  features?: Record<string, number>;
  action?: string;
  audience?: string;
  replay?: { sourceSession: string; label: string };
}

export interface PresenterSettings {
  on: boolean;
  predictEverySeconds?: number;
  cooldownSeconds?: number;
  windowSeconds?: number;
  replays?: Array<{ state: string; sourceSession: string }>;
  message?: string;
}

const STATES = ['PRODUCTIVE', 'DRIVER_DOMINANCE', 'PASSIVE_NAVIGATOR', 'LOGIC_STRUGGLE', 'DISENGAGED'];

/** The engine's confidence gate (ML_CONFIDENCE_THRESHOLD in the ML service). */
const GATE = 0.6;

const percent = (value: number) => `${Math.round(value * 100)}%`;

function duration(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${Math.round(seconds % 60)} s`;
}

/** The features worth reading aloud, in words, out of the model's fifteen. */
const FEATURES: Array<{ key: string; label: string; show: (v: number) => string }> = [
  { key: 'total_edit_count', label: 'Edits', show: (v) => String(Math.round(v)) },
  { key: 'discussion_note_count', label: 'Chat messages', show: (v) => String(Math.round(v)) },
  { key: 'navigator_note_count', label: '…from the navigator', show: (v) => String(Math.round(v)) },
  { key: 'run_attempt_count', label: 'Runs', show: (v) => String(Math.round(v)) },
  { key: 'run_success_rate', label: 'Runs that worked', show: percent },
  { key: 'consecutive_failure_count', label: 'Failures in a row', show: (v) => String(Math.round(v)) },
  { key: 'idle_ratio', label: 'Time idle', show: percent },
  { key: 'role_switch_count', label: 'Role switches', show: (v) => String(Math.round(v)) },
  { key: 'seconds_since_role_switch', label: 'Since the last switch', show: duration },
  { key: 'active_user_dominance', label: 'Busiest partner’s share', show: percent },
];

/** What the engine did, as one line. */
function decisionText(report: PredictionReport, cooldownSeconds: number) {
  const to = report.audience && report.audience !== 'pair' ? ` to the ${report.audience}` : ' to the pair';
  switch (report.decision) {
    case 'sent':
      return { tone: 'text-ok', text: `Nudge sent${to}.` };
    case 'below_gate':
      return { tone: 'text-muted', text: `Under the ${percent(GATE)} confidence gate, so it stays quiet.` };
    case 'no_action':
      return { tone: 'text-muted', text: 'No nudge for this state.' };
    case 'cooldown':
      return { tone: 'text-muted', text: `Same nudge shown in the last ${cooldownSeconds} s, so it waits.` };
    case 'target_offline':
      return { tone: 'text-warn', text: `Meant for the ${report.audience}, who is not connected.` };
    case 'too_few_events':
      return { tone: 'text-muted', text: `Only ${report.eventCount} event(s) in the window - the model needs 3.` };
    default:
      return { tone: 'text-danger', text: 'The ML service did not answer.' };
  }
}

export function EnginePanel({
  settings,
  reports,
  onReplay,
  onTurnOff,
}: {
  settings: PresenterSettings;
  reports: PredictionReport[];
  onReplay: (state: string) => void;
  onTurnOff: () => void;
}) {
  const latest = reports[0];
  const predicted = reports.filter((r) => r.state);
  const cooldown = settings.cooldownSeconds ?? 20;

  return (
    <section className="overflow-hidden rounded-cg-lg border-2 border-hue-pair/40 bg-card shadow-cg-md">
      <header className="flex flex-wrap items-center gap-3 border-b border-line bg-hue-pair/5 px-5 py-3">
        <span className="hidden h-9 w-9 shrink-0 place-items-center rounded-cg bg-hue-pair/15 text-hue-pair sm:grid">
          <BrainCircuit size={18} strokeWidth={2.2} aria-hidden />
        </span>
        <div className="min-w-[14rem] flex-1">
          <h2 className="flex flex-wrap items-center gap-2 font-bold text-ink">
            Live ML engine
            <span className="flex items-center gap-1 rounded-full bg-hue-pair px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-on-accent">
              <Radio size={11} aria-hidden />
              Presenter mode
            </span>
          </h2>
          <p className="text-xs text-muted">
            XGBoost reads the last {settings.windowSeconds ?? 180} s of this session every{' '}
            {settings.predictEverySeconds ?? 10} s. Nudges fire above the {percent(GATE)} gate; the same
            nudge waits {cooldown} s here (5 min in a normal session). Nothing in this mode is stored.
          </p>
        </div>
        <button type="button" onClick={onTurnOff} className={buttonClass({ variant: 'ghost', size: 'sm' })}>
          <Power size={14} aria-hidden />
          Turn off
        </button>
      </header>

      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        {/* ── The latest prediction ─────────────────────────────────── */}
        <div>
          {!latest ? (
            <p className="rounded-cg border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
              Waiting for the first prediction. Type, chat or run - or replay a recorded window below.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {latest.state ? (
                  <StateChip state={latest.state} confidence={latest.confidence} />
                ) : (
                  <span className="text-sm font-semibold text-muted">No prediction</span>
                )}
                <span className="text-xs text-muted">
                  {latest.source === 'replay' && latest.replay
                    ? `Replay of held-out session ${latest.replay.sourceSession} (labelled ${lookOf(latest.replay.label).label.toLowerCase()})`
                    : `Live: this session, ${latest.eventCount} events in the window`}
                  {' · '}
                  {new Date(latest.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>

              <p className={clsx('mt-2 text-sm font-semibold', decisionText(latest, cooldown).tone)}>
                → {decisionText(latest, cooldown).text}
              </p>

              {latest.probabilities && <Probabilities probabilities={latest.probabilities} />}
            </>
          )}
        </div>

        {/* ── What the model read ───────────────────────────────────── */}
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted">What the model read</p>
          {latest?.features && Object.keys(latest.features).length > 0 ? (
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              {FEATURES.filter((f) => f.key in latest.features!).map((feature) => (
                <div key={feature.key} className="flex items-baseline justify-between gap-2 border-b border-line/60 pb-1">
                  <dt className="min-w-0 truncate text-muted">{feature.label}</dt>
                  <dd className="shrink-0 whitespace-nowrap font-mono text-ink tabular-nums">{feature.show(latest.features![feature.key])}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-2 text-sm text-muted">The features appear with the first prediction.</p>
          )}
        </div>
      </div>

      {/* ── Timeline ───────────────────────────────────────────────── */}
      <div className="border-t border-line px-5 py-3">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
          <History size={12} aria-hidden />
          Predictions so far, newest on the right
        </p>
        <ol className="mt-2 flex min-h-[1.75rem] flex-wrap items-end gap-1">
          {predicted
            .slice(0, 40)
            .reverse()
            .map((report, index) => {
              const look = lookOf(report.state);
              return (
                <li
                  key={`${report.at}-${index}`}
                  title={`${look.label} ${percent(report.confidence ?? 0)} · ${report.source}${
                    report.decision === 'sent' ? ' · nudge sent' : ''
                  }`}
                  className={clsx(
                    'h-5 w-5 rounded-[4px]',
                    look.solid,
                    report.decision === 'sent' ? 'ring-2 ring-ink/70 ring-offset-1 ring-offset-card' : 'opacity-70',
                    report.source === 'replay' && 'rounded-full',
                  )}
                />
              );
            })}
        </ol>
        <p className="mt-1.5 text-[11px] text-muted">
          Square: live · circle: replay · outlined: became a nudge
        </p>
      </div>

      {/* ── Replays ────────────────────────────────────────────────── */}
      <div className="border-t border-line bg-card-alt/60 px-5 py-4">
        <p className="text-sm font-semibold text-ink">Replay a held-out window through the engine</p>
        <p className="mt-0.5 text-xs text-muted">
          A recorded 180 s window per state from the model&rsquo;s test split - sessions it was never trained on - goes
          through the same model, gate and delivery as a live one. Use it when there is no time to act a state out.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {STATES.map((state) => {
            const look = NUDGE_LOOK[state];
            const Icon = look.icon;
            const available = settings.replays?.some((r) => r.state === state) ?? true;
            return (
              <button
                key={state}
                type="button"
                disabled={!available}
                onClick={() => onReplay(state)}
                className={clsx(
                  'cg-focusable flex items-center gap-2 rounded-full border-2 bg-card px-3 py-1.5 text-sm font-semibold transition hover:-translate-y-px disabled:opacity-50',
                  look.border,
                  look.text,
                )}
              >
                <Icon size={14} strokeWidth={2.3} aria-hidden />
                {look.label}
                <Play size={12} strokeWidth={2.6} aria-hidden className="opacity-70" />
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function StateChip({ state, confidence }: { state: string; confidence?: number }) {
  const look = lookOf(state);
  const Icon = look.icon;
  return (
    <span className={clsx('flex items-center gap-2 rounded-full border-2 px-3 py-1', look.border, look.soft)}>
      <Icon size={16} strokeWidth={2.3} aria-hidden className={look.text} />
      <span className={clsx('font-bold', look.text)}>{look.label}</span>
      {typeof confidence === 'number' && <span className="font-mono text-sm text-ink">{percent(confidence)}</span>}
    </span>
  );
}

/** All five, with the gate drawn across them. */
function Probabilities({ probabilities }: { probabilities: Record<string, number> }) {
  return (
    <div className="relative mt-4 space-y-2">
      {STATES.map((state) => {
        const look = NUDGE_LOOK[state];
        const value = probabilities[state] ?? 0;
        return (
          <div key={state} className="grid grid-cols-[8.5rem_minmax(0,1fr)_3rem] items-center gap-3 text-sm">
            <span className="truncate text-body">{look.label}</span>
            <span className="relative h-3 overflow-hidden rounded-full bg-inset">
              <span
                className={clsx('absolute inset-y-0 left-0 rounded-full transition-[width] duration-500', look.solid)}
                style={{ width: `${Math.max(1, value * 100)}%` }}
              />
              <span
                aria-hidden
                className="absolute inset-y-0 w-0.5 bg-ink/50"
                style={{ left: `${GATE * 100}%` }}
                title="Confidence gate"
              />
            </span>
            <span className="text-right font-mono text-ink tabular-nums">{percent(value)}</span>
          </div>
        );
      })}
      <p className="pl-[9.25rem] text-[11px] text-muted">The line is the {percent(GATE)} gate.</p>
    </div>
  );
}
