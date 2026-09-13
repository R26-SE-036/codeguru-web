'use client';

import { useState } from 'react';
import { BrainCircuit, Loader2, RotateCcw, TriangleAlert } from 'lucide-react';

import { ApiError, api } from '@/lib/api';
import { STATE_TONE, stateLabel } from '@/lib/pair-events';
import { Badge, Card, PageHeader, SectionTitle, buttonClass } from '@/components/ui';

/**
 * Put a feature vector in front of the classifier and see what it says.
 *
 * Ported from Pair_Path frontend/src/app/ml-sandbox/page.tsx.
 *
 * ==================== WHY THIS PAGE EARNS ITS PLACE ====================
 * It is the only way to make the model produce a chosen state on demand. You
 * cannot make a live pair be DISENGAGED for a demonstration - that means two
 * people sitting still for three minutes - and a classifier nobody can
 * interrogate is a classifier nobody can evaluate. It is also the only surface
 * that shows the intervention's uiTarget and uiEffect next to the retrieved
 * hint, which is the whole delivery contract in one screen.
 *
 * ============================ AND ITS LIMITS ============================
 * These sliders can express vectors the extractor could never emit - more
 * driver edits than total edits, for instance. That is useful for probing a
 * boundary and misleading as evidence, so nothing here is a measurement. The
 * numbers behind each preset are the median of that state in the SIMULATED
 * corpus, and the model serving them was trained on that same corpus. Both
 * facts are on the page rather than in a comment, because someone will be
 * shown this screen and will otherwise reasonably assume it describes students.
 *
 * The original called ml-service straight from the browser, at a URL compiled
 * into the client bundle, past the API's JWT guard entirely. It goes through
 * the BFF now - which needed PredictPairStateDto to accept a `features`
 * vector, a path ml-service always supported and the API had never exposed.
 * =======================================================================
 */

interface Features {
  total_edit_count: number;
  driver_edit_count: number;
  navigator_edit_count: number;
  edit_balance_ratio: number;
  run_attempt_count: number;
  run_success_rate: number;
  consecutive_failure_count: number;
  error_recovery_seconds_avg: number;
  idle_ratio: number;
  discussion_note_count: number;
  navigator_note_count: number;
  role_switch_count: number;
  seconds_since_role_switch: number;
  session_elapsed_seconds: number;
  active_user_dominance: number;
}

/**
 * Median values per state in the simulated corpus.
 *
 * The names must match ml/app/features/extractor.py exactly. An earlier
 * version of this page used a retired naming scheme, and because the predictor
 * fills anything it cannot find with 0.0, every slider silently resolved to
 * zero and the model returned the same answer whatever you dragged.
 */
const PRESETS: Record<string, Features> = {
  PRODUCTIVE: {
    total_edit_count: 15, driver_edit_count: 14, navigator_edit_count: 0, edit_balance_ratio: 1,
    run_attempt_count: 1, run_success_rate: 1, consecutive_failure_count: 0,
    error_recovery_seconds_avg: 0, idle_ratio: 0.17, discussion_note_count: 3,
    navigator_note_count: 1, role_switch_count: 0, seconds_since_role_switch: 210,
    session_elapsed_seconds: 450, active_user_dominance: 0.89,
  },
  DRIVER_DOMINANCE: {
    total_edit_count: 18, driver_edit_count: 18, navigator_edit_count: 0, edit_balance_ratio: 1,
    run_attempt_count: 1, run_success_rate: 1, consecutive_failure_count: 0,
    error_recovery_seconds_avg: 0, idle_ratio: 0.06, discussion_note_count: 2,
    navigator_note_count: 1, role_switch_count: 0, seconds_since_role_switch: 450,
    session_elapsed_seconds: 450, active_user_dominance: 0.95,
  },
  PASSIVE_NAVIGATOR: {
    total_edit_count: 16, driver_edit_count: 16, navigator_edit_count: 0, edit_balance_ratio: 1,
    run_attempt_count: 1, run_success_rate: 1, consecutive_failure_count: 0,
    error_recovery_seconds_avg: 0, idle_ratio: 0.17, discussion_note_count: 1,
    navigator_note_count: 0, role_switch_count: 0, seconds_since_role_switch: 300,
    session_elapsed_seconds: 450, active_user_dominance: 1,
  },
  LOGIC_STRUGGLE: {
    total_edit_count: 13, driver_edit_count: 13, navigator_edit_count: 0, edit_balance_ratio: 1,
    run_attempt_count: 3, run_success_rate: 0, consecutive_failure_count: 2,
    error_recovery_seconds_avg: 0, idle_ratio: 0.17, discussion_note_count: 2,
    navigator_note_count: 1, role_switch_count: 0, seconds_since_role_switch: 383,
    session_elapsed_seconds: 450, active_user_dominance: 0.95,
  },
  DISENGAGED: {
    total_edit_count: 3, driver_edit_count: 3, navigator_edit_count: 0, edit_balance_ratio: 1,
    run_attempt_count: 0, run_success_rate: 0.5, consecutive_failure_count: 0,
    error_recovery_seconds_avg: 0, idle_ratio: 0.78, discussion_note_count: 0,
    navigator_note_count: 0, role_switch_count: 0, seconds_since_role_switch: 450,
    session_elapsed_seconds: 450, active_user_dominance: 1,
  },
};

interface SliderSpec {
  key: keyof Features;
  label: string;
  min: number;
  max: number;
  step: number;
}

const GROUPS: { title: string; note?: string; sliders: SliderSpec[] }[] = [
  {
    title: 'Activity',
    sliders: [
      { key: 'total_edit_count', label: 'Total edits', min: 0, max: 40, step: 1 },
      { key: 'driver_edit_count', label: 'Edits by the driver', min: 0, max: 40, step: 1 },
      { key: 'navigator_edit_count', label: 'Edits by the navigator', min: 0, max: 40, step: 1 },
      { key: 'idle_ratio', label: 'Idle ratio (1 = nothing happening)', min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    title: 'Running code',
    sliders: [
      { key: 'run_attempt_count', label: 'Run attempts', min: 0, max: 12, step: 1 },
      { key: 'run_success_rate', label: 'Run success rate', min: 0, max: 1, step: 0.05 },
      { key: 'consecutive_failure_count', label: 'Longest failure streak', min: 0, max: 10, step: 1 },
      { key: 'error_recovery_seconds_avg', label: 'Avg seconds to recover from a failure', min: 0, max: 300, step: 5 },
    ],
  },
  {
    title: 'Talking',
    note: 'Navigator messages are what separate driver dominance from a passive navigator.',
    sliders: [
      { key: 'discussion_note_count', label: 'Messages from both students', min: 0, max: 15, step: 1 },
      { key: 'navigator_note_count', label: 'Messages from the navigator', min: 0, max: 15, step: 1 },
    ],
  },
  {
    title: 'Roles and time',
    note: 'Time since the last swap is what separates driver dominance from a productive pair.',
    sliders: [
      { key: 'role_switch_count', label: 'Role swaps in this window', min: 0, max: 5, step: 1 },
      { key: 'seconds_since_role_switch', label: 'Seconds since the last swap', min: 0, max: 900, step: 10 },
      { key: 'session_elapsed_seconds', label: 'Seconds the session has been running', min: 0, max: 1800, step: 30 },
    ],
  },
  {
    title: 'Derived',
    note: 'Normally computed from the values above; adjustable here for experimentation.',
    sliders: [
      { key: 'edit_balance_ratio', label: 'Edit balance (1 = one person did all edits)', min: 0, max: 1, step: 0.05 },
      { key: 'active_user_dominance', label: 'Activity dominance (1 = one person did everything)', min: 0, max: 1, step: 0.05 },
    ],
  },
];

interface Prediction {
  predictedState: string;
  confidence: number;
  modelVersion: string;
}

interface Delivery {
  uiTarget?: string;
  uiEffect?: string;
  message?: string;
  audience?: string;
}

interface Recommendation {
  action: string;
  delivery?: Delivery;
}

interface Hint {
  conceptReminder: string;
  exampleIdea: string;
  reflectiveQuestion: string;
  fallbackUsed?: boolean;
}

const SANDBOX_SESSION_ID = 'sandbox-session';

export default function SandboxPage() {
  const [features, setFeatures] = useState<Features>(PRESETS.PRODUCTIVE);
  const [busy, setBusy] = useState(false);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [hint, setHint] = useState<Hint | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function predict() {
    setBusy(true);
    setError(null);
    setHint(null);

    try {
      const state = await api.post<Prediction>('pair', '/ml/predict-pair-state', {
        sessionId: SANDBOX_SESSION_ID,
        features,
      });
      setPrediction(state);

      const recommended = await api.post<Recommendation>('pair', '/ml/recommend-intervention', {
        sessionId: SANDBOX_SESSION_ID,
        predictedState: state.predictedState,
        confidence: state.confidence,
      });
      setRecommendation(recommended);

      // A hint accompanies a logic struggle, and only that - which is what the
      // live gateway does, keyed off the predicted state rather than a choice
      // made here.
      if (state.predictedState === 'LOGIC_STRUGGLE') {
        setHint(
          await api.post<Hint>('pair', '/ml/retrieve-hint', {
            sessionId: SANDBOX_SESSION_ID,
            predictedState: 'LOGIC_STRUGGLE',
            interventionType: 'LOGIC_HINT',
            questionConceptTags: [],
          }),
        );
      }
    } catch (err) {
      setError(
        err instanceof ApiError && err.isUnavailable
          ? 'The model service is not reachable right now.'
          : 'The model could not be asked. Check that ml is running.',
      );
    } finally {
      setBusy(false);
    }
  }

  function applyPreset(name: string) {
    setFeatures(PRESETS[name]);
    setPrediction(null);
    setRecommendation(null);
    setHint(null);
    setError(null);
  }

  const simulated = prediction?.modelVersion?.startsWith('demo_simulated');

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Pair"
        title="Model sandbox"
        lead="Set a window of features by hand and see how the collaboration classifier reads it."
        icon={BrainCircuit}
        tone="text-hue-insight"
        toneBg="bg-hue-insight/10"
      />

      {/* Said before anyone reads a number off this page, not after. */}
      <p className="flex items-start gap-3 rounded-cg border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-body">
        <TriangleAlert size={16} strokeWidth={2.2} aria-hidden className="mt-0.5 shrink-0 text-warn" />
        <span>
          These are hand-set values, not a recorded session — the sliders can express
          combinations the extractor would never produce. Nothing here is a measurement of
          how the model performs.
        </span>
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-sm text-muted">
          <RotateCcw size={14} strokeWidth={2.2} aria-hidden />
          Load a typical
        </span>
        {Object.keys(PRESETS).map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => applyPreset(name)}
            className={buttonClass({ variant: 'secondary', size: 'sm' })}
          >
            {stateLabel(name)}
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="space-y-6 p-6">
          <SectionTitle>Window features</SectionTitle>

          {GROUPS.map((group) => (
            <div key={group.title} className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-ink">
                  {group.title}
                </h3>
                {group.note && <p className="mt-1 text-xs text-muted">{group.note}</p>}
              </div>
              {group.sliders.map((slider) => (
                <FeatureSlider
                  key={slider.key}
                  spec={slider}
                  value={features[slider.key]}
                  onChange={(value) =>
                    setFeatures((prev) => ({ ...prev, [slider.key]: value }))
                  }
                />
              ))}
            </div>
          ))}

          <button
            type="button"
            onClick={predict}
            disabled={busy}
            className={buttonClass({ size: 'lg', className: 'w-full' })}
          >
            {busy ? <Loader2 size={17} className="animate-spin" aria-hidden /> : null}
            Predict pair state
          </button>
        </Card>

        <div className="space-y-5">
          <Card className="p-6">
            <SectionTitle>Prediction</SectionTitle>

            {error ? (
              <p className="py-10 text-center text-sm text-body">{error}</p>
            ) : !prediction ? (
              <p className="py-10 text-center text-sm text-muted">
                Load a preset or move the sliders, then predict.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge tone={STATE_TONE[prediction.predictedState] ?? 'neutral'}>
                    {stateLabel(prediction.predictedState)}
                  </Badge>
                  <span className="text-2xl font-bold tabular-nums text-ink">
                    {(prediction.confidence * 100).toFixed(1)}%
                  </span>
                  <span className="text-sm text-muted">confident</span>
                </div>

                <p className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-muted">model</span>
                  <span className="font-mono text-muted">{prediction.modelVersion}</span>
                </p>

                {simulated && (
                  // The model card disowns its own metrics: data_provenance says
                  // SIMULATED_DEMO and the label policy was explicitly waived.
                  // Anyone reading a confidence off this screen needs that.
                  <p className="rounded-cg border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-body">
                    Trained on generated sessions, not students. Its confidence describes the
                    generator.
                  </p>
                )}
              </div>
            )}
          </Card>

          {recommendation && (
            <Card className="p-6">
              <SectionTitle>What it would do</SectionTitle>

              <dl className="mt-4 space-y-2 text-sm">
                <Row label="Action">
                  <span className="font-mono text-xs text-ink">{recommendation.action}</span>
                </Row>
                <Row label="Draw attention to">
                  <span className="font-mono text-xs text-ink">
                    {recommendation.delivery?.uiTarget ?? '—'}
                  </span>
                </Row>
                <Row label="Effect">
                  <span className="font-mono text-xs text-ink">
                    {recommendation.delivery?.uiEffect ?? '—'}
                  </span>
                </Row>
                <Row label="Addressed to">
                  <span className="font-mono text-xs text-ink">
                    {recommendation.delivery?.audience ?? 'pair'}
                  </span>
                </Row>
              </dl>

              {recommendation.delivery?.message && (
                <p className="mt-4 rounded-cg bg-inset px-3 py-2.5 text-sm text-body">
                  “{recommendation.delivery.message}”
                </p>
              )}
            </Card>
          )}

          {hint && (
            <Card className="p-6">
              <SectionTitle hint={hint.fallbackUsed ? 'nothing matched' : undefined}>
                Retrieved hint
              </SectionTitle>

              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Concept
                  </dt>
                  <dd className="mt-1 text-body">{hint.conceptReminder}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Try this
                  </dt>
                  <dd className="mt-1 text-body">{hint.exampleIdea}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Ask yourselves
                  </dt>
                  <dd className="mt-1 text-body">{hint.reflectiveQuestion}</dd>
                </div>
              </dl>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function FeatureSlider({
  spec,
  value,
  onChange,
}: {
  spec: SliderSpec;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex justify-between gap-3 text-sm">
        <label htmlFor={spec.key} className="text-body">
          {spec.label}
        </label>
        <span className="font-mono tabular-nums text-accent">{value}</span>
      </div>
      <input
        id={spec.key}
        type="range"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="cg-focusable w-full accent-accent"
      />
    </div>
  );
}
