'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  CircleCheck,
  Gamepad2,
  GripVertical,
  Info,
  Lightbulb,
  Loader2,
  Timer,
  TriangleAlert,
} from 'lucide-react';

import { ApiError, api } from '@/lib/api';
import { describeDifficultySource, formatConcept, formatGameType } from '@/lib/vocabulary';
import { FormError } from '@/components/field';
import { Badge, Card, buttonClass } from '@/components/ui';

/**
 * The game machine, the drag-and-drop and the three interactions are the
 * original's. What changed is everything around the edges: two axios clients
 * become one BFF client, react-router's `location.state` becomes sessionStorage
 * (Next has no route state), and the learning session is created on demand
 * rather than read out of localStorage.
 */

interface Question {
  id: string;
  gameType: string;
  conceptTag: string;
  difficulty: string;
  codeLines: string[];
  hints?: string[];
  /** CodeFix only: the line the student has to rewrite. */
  buggyLineIndex?: number;
  /** Added by the backend: which engine chose the difficulty. */
  difficultyChosenBy?: string;
  difficultyConfidence?: number | null;
  targetDifficulty?: string;
}

interface SubmitResult {
  score: number;
  learnerFeedback?: string;
  explanation?: string;
}

type Answer = number | number[] | string | null;

/**
 * CodeFix only. The verdict on the last checked attempt, and the hint that came
 * back with it.
 *
 * Checking is a server call, not a local comparison: the answer never reaches
 * the browser (see the backend's /game/check), which is also what makes the
 * error count a measurement rather than something this component reports about
 * itself.
 */
interface CheckState {
  correct: boolean;
  hint: string | null;
  wrongAttempts: number;
}

interface State {
  question: Question | null;
  answer: Answer;
  hintLevel: number;
  check: CheckState | null;
  checking: boolean;
  attemptCount: number;
  seconds: number;
  phase: 'loading' | 'playing' | 'submitted';
  error: string | null;
}

type Action =
  | { type: 'INIT'; question: Question }
  | { type: 'ANSWER'; answer: Answer }
  | { type: 'HINT' }
  | { type: 'CHECKING' }
  | { type: 'CHECKED'; check: CheckState }
  | { type: 'TICK' }
  | { type: 'SUBMIT' }
  | { type: 'ERROR'; message: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'INIT': {
      // The initial answer differs per interaction: DragDrop starts as the
      // current ordering, CodeTrace as an empty string, BugHunt as nothing
      // selected. Getting this wrong disables Submit forever, because the
      // button is gated on `answer !== null`.
      // CodeFix starts with the broken line already in the box, trimmed of its
      // indentation. The task is to correct a line, not to retype it, and
      // leading whitespace is not part of the answer - the grader ignores it.
      const answer: Answer =
        action.question.gameType === 'DragDrop'
          ? action.question.codeLines.map((_, index) => index)
          : action.question.gameType === 'CodeTrace'
            ? ''
            : action.question.gameType === 'CodeFix'
              ? (action.question.codeLines[action.question.buggyLineIndex ?? 0] ?? '').trim()
              : null;
      return {
        ...state,
        question: action.question,
        answer,
        phase: 'playing',
        error: null,
        check: null,
      };
    }
    case 'ANSWER':
      // Editing clears the previous verdict. Leaving a red "not right" under a
      // line the student has since changed reads as a judgement on the new text.
      return { ...state, answer: action.answer, check: null };
    case 'CHECKING':
      return { ...state, checking: true };
    case 'CHECKED':
      return { ...state, checking: false, check: action.check };
    case 'HINT':
      return { ...state, hintLevel: Math.min(state.hintLevel + 1, 3) };
    case 'TICK':
      return { ...state, seconds: state.seconds + 1 };
    case 'SUBMIT':
      return { ...state, phase: 'submitted' };
    case 'ERROR':
      return { ...state, error: action.message, phase: state.question ? 'playing' : 'loading' };
    default:
      return state;
  }
}

export function GamePlayer({
  userId,
  gameType,
  conceptTag,
  difficulty,
}: {
  /**
   * The real Code Coach user id, passed down from the server component.
   *
   * Not the string 'me'. Code Coach's own endpoints use `me` and resolve it
   * from the token, but the gamification engine's routes take :userId in the
   * path and compare it against the token's owner - so 'me' fails that check
   * with a 403. Aligning the engine with the platform's `me` convention would
   * be the better fix, and belongs in that service rather than here.
   */
  userId: string;
  gameType: string;
  conceptTag: string;
  difficulty: string;
}) {
  const router = useRouter();
  const [state, dispatch] = useReducer(reducer, {
    question: null,
    answer: null,
    hintLevel: 0,
    check: null,
    checking: false,
    attemptCount: 1,
    seconds: 0,
    phase: 'loading',
    error: null,
  });
  const [result, setResult] = useState<SubmitResult | null>(null);
  const learningSessionId = useRef<string | null>(null);

  const dragFrom = useRef<number | null>(null);
  const dragTo = useRef<number | null>(null);

  /**
   * The question's OWN gameType and difficulty, not the URL's.
   *
   * The URL carries what Code Coach recommended, in its vocabulary, and
   * `auto` for the difficulty. The server resolves both and returns a real
   * question; rendering from the URL showed the wrong interaction and reported
   * a difficulty the student never played - which then fed Code Coach's
   * mastery model.
   */
  const activeGameType = state.question?.gameType ?? gameType;
  const activeDifficulty = state.question?.difficulty ?? difficulty;

  useEffect(() => {
    let live = true;

    (async () => {
      try {
        // Create or resume the learning session that groups this activity.
        // Code Coach's endpoint is create-or-resume, so calling it per game is
        // correct rather than wasteful, and it replaces reading an id out of
        // localStorage that nothing guaranteed was still valid.
        const session = await api
          .post<{ learning_session_id: string }>('coach', '/learning-sessions', {
            source_component: 'gamification',
            language: 'java',
            task_id: 'adaptive_practice',
          })
          .catch(() => null);

        if (!live) return;
        learningSessionId.current = session?.learning_session_id ?? null;

        const question = await api.get<Question>(
          'play',
          `/game/${userId}/${gameType}/${conceptTag}/${difficulty}`,
        );
        if (!live) return;

        dispatch({ type: 'INIT', question });
      } catch (error) {
        if (!live) return;
        dispatch({
          type: 'ERROR',
          message:
            error instanceof ApiError && error.isUnavailable
              ? 'Practice is unavailable right now. Please try again shortly.'
              : 'We could not load your practice activity.',
        });
      }
    })();

    return () => {
      live = false;
    };
  }, [userId, gameType, conceptTag, difficulty]);

  useEffect(() => {
    if (state.phase !== 'playing') return;
    const timer = setInterval(() => dispatch({ type: 'TICK' }), 1000);
    return () => clearInterval(timer);
  }, [state.phase]);

  const onDrop = useCallback(() => {
    if (!Array.isArray(state.answer) || dragFrom.current === null || dragTo.current === null) {
      return;
    }
    const next = [...state.answer];
    const [moved] = next.splice(dragFrom.current, 1);
    next.splice(dragTo.current, 0, moved);
    dragFrom.current = null;
    dragTo.current = null;
    dispatch({ type: 'ANSWER', answer: next });
  }, [state.answer]);

  /**
   * CodeFix: ask the server whether this line is right, without ending the game.
   *
   * The verdict is not computed here because the answer is not here - the
   * question arrives with `correctAnswer` stripped. That is deliberate twice
   * over: unlimited local checking would leak the answer to anyone reading the
   * network tab, and every check being a server call is what lets the engine
   * COUNT the wrong ones. `errorCount` used to be `isCorrect ? 0 : 1`, so the
   * proposal's own `errorCount > 5` rule could never fire.
   *
   * A correct check finalises the round immediately - having got it right,
   * being made to press a second button says nothing.
   */
  async function check() {
    if (!state.question || typeof state.answer !== 'string' || !state.answer.trim()) return;

    dispatch({ type: 'CHECKING' });

    try {
      const verdict = await api.post<{
        correct: boolean;
        hint: string | null;
        wrongAttempts: number;
      }>('play', '/game/check', {
        userId,
        learningSessionId: learningSessionId.current,
        questionId: state.question.id,
        attempt: state.answer,
      });

      dispatch({
        type: 'CHECKED',
        check: {
          correct: verdict.correct,
          hint: verdict.hint ?? null,
          wrongAttempts: verdict.wrongAttempts ?? 0,
        },
      });

      if (verdict.correct) await submit();
    } catch {
      // Checking is a convenience; failing it must not strand the student. They
      // can still submit, which grades the same answer the same way.
      dispatch({
        type: 'CHECKED',
        check: { correct: false, hint: 'Could not reach the checker. You can still submit.', wrongAttempts: 0 },
      });
    }
  }

  async function submit() {
    if (state.answer === null || !state.question) return;

    try {
      const submitted = await api.post<SubmitResult>('play', '/game/submit', {
        userId,
        learningSessionId: learningSessionId.current,
        gameType: activeGameType,
        conceptTag,
        questionId: state.question.id,
        selectedAnswer: state.answer,
        hintUsage: state.hintLevel,
        timeTakenSeconds: state.seconds,
        attemptCount: state.attemptCount,
      });

      setResult(submitted);
      dispatch({ type: 'SUBMIT' });

      // Report back to Code Coach so mastery updates. Best effort: the student
      // has already played, and losing the report must not lose their result.
      if (learningSessionId.current) {
        api
          .post('coach', '/gamification/me/session-results', {
            learningSessionId: learningSessionId.current,
            concept_tag: conceptTag,
            game_id: state.question.id,
            game_type: activeGameType,
            difficulty_level: activeDifficulty,
            score_percent: submitted.score,
            // Required by the contract. Dropping it makes Code Coach answer
            // 422, and because this call is best-effort the failure is only a
            // console warning - so mastery silently never updates from games.
            error_count: submitted.score > 0 ? 0 : 1,
            attempt_count: state.attemptCount,
            hint_usage: state.hintLevel,
            time_taken_seconds: state.seconds,
            // `passed` is deliberately NOT sent. The integration guide is
            // explicit: send the score and let Code Coach apply the pass mark,
            // or this service ends up disagreeing with the rest of the platform
            // about what passing means.
          })
          .catch((error) => console.warn('Could not record the result in Code Coach:', error));
      }

      sessionStorage.setItem(
        'codeguru.lastGameResult',
        JSON.stringify({
          result: submitted,
          conceptTag,
          gameType: activeGameType,
          difficulty: activeDifficulty,
          attemptCount: state.attemptCount,
          hintLevel: state.hintLevel,
          seconds: state.seconds,
        }),
      );

      setTimeout(() => router.push('/play/results'), 2500);
    } catch {
      dispatch({ type: 'ERROR', message: 'We could not save this attempt. Please try again.' });
    }
  }

  if (state.phase === 'loading' && !state.error) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="cg-skeleton h-16 w-full" />
        <div className="cg-skeleton h-64 w-full" />
        <div className="cg-skeleton h-11 w-40" />
      </div>
    );
  }

  const question = state.question;

  if (!question) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card className="px-6 py-12 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-cg-lg bg-danger/10 text-danger">
            <TriangleAlert size={22} strokeWidth={2} aria-hidden />
          </span>
          <h1 className="mt-4 text-lg font-bold text-ink">No round to play</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-body">
            {state.error ?? 'No activity available.'}
          </p>
          <Link
            href="/play"
            className={buttonClass({ variant: 'secondary', className: 'mt-6' })}
          >
            <ArrowLeft size={16} strokeWidth={2.2} aria-hidden />
            Back to practice
          </Link>
        </Card>
      </div>
    );
  }

  const chosenBy = describeDifficultySource(question.difficultyChosenBy);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-cg bg-hue-play/10 text-hue-play">
            <Gamepad2 size={19} strokeWidth={2.1} aria-hidden />
          </span>
          <div>
            <h1 className="font-bold text-ink">{formatGameType(activeGameType)}</h1>
            <p className="text-sm text-muted">
              {formatConcept(conceptTag)}
              {chosenBy ? ` — ${chosenBy}` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge tone="neutral">{activeDifficulty}</Badge>
          {/* tabular-nums so a ticking clock does not jitter the layout every
              time the digit width changes. */}
          <Badge tone="accent" className="tabular-nums">
            <Timer size={13} strokeWidth={2.4} aria-hidden />
            {state.seconds}s
          </Badge>
        </div>
      </header>

      <Card className="overflow-hidden">
        <h2 className="border-b border-line bg-card-alt px-5 py-3 font-semibold text-ink">
          {activeGameType === 'BugHunt' && 'Find the line with the mistake'}
          {activeGameType === 'DragDrop' && 'Drag the lines into a correct order'}
          {activeGameType === 'CodeTrace' && 'Trace the code and give the final output'}
          {activeGameType === 'CodeFix' && 'Rewrite the highlighted line so the code is correct'}
        </h2>

        <div className="overflow-x-auto bg-inset p-4 font-mono text-sm">
          {activeGameType === 'BugHunt' &&
            question.codeLines.map((line, index) => (
              <button
                key={index}
                type="button"
                onClick={() => dispatch({ type: 'ANSWER', answer: index })}
                className={`cg-focusable flex w-full gap-4 rounded-cg-sm px-2.5 py-1.5 text-left transition duration-150 ease-cg ${
                  state.answer === index
                    ? 'bg-accent/20 text-ink ring-1 ring-inset ring-accent/40'
                    : 'hover:bg-card/70'
                }`}
              >
                <span className="w-5 select-none text-right text-faint-nontext">
                  {index + 1}
                </span>
                <span className="whitespace-pre">{line}</span>
              </button>
            ))}

          {activeGameType === 'DragDrop' &&
            Array.isArray(state.answer) &&
            state.answer.map((originalIndex, position) => (
              <div
                key={`${originalIndex}-${position}`}
                draggable
                onDragStart={() => (dragFrom.current = position)}
                onDragEnter={() => (dragTo.current = position)}
                onDragEnd={onDrop}
                onDragOver={(event) => event.preventDefault()}
                className="group flex cursor-grab items-center gap-3 rounded-cg-sm px-2.5 py-1.5 transition hover:bg-card/70 active:cursor-grabbing"
              >
                <GripVertical
                  size={15}
                  aria-hidden
                  className="shrink-0 text-faint-nontext transition group-hover:text-muted"
                />
                <span className="whitespace-pre">{question.codeLines[originalIndex]}</span>
              </div>
            ))}

          {activeGameType === 'CodeTrace' && (
            <>
              {question.codeLines.map((line, index) => (
                <div key={index} className="flex gap-4 px-2.5 py-1.5">
                  <span className="w-5 select-none text-right text-faint-nontext">
                    {index + 1}
                  </span>
                  <span className="whitespace-pre">{line}</span>
                </div>
              ))}
              <div className="mt-5 border-t border-line pt-4">
                <label
                  htmlFor="trace"
                  className="mb-2 block font-sans text-sm font-semibold text-ink"
                >
                  Final output
                </label>
                <input
                  id="trace"
                  value={typeof state.answer === 'string' ? state.answer : ''}
                  onChange={(event) => dispatch({ type: 'ANSWER', answer: event.target.value })}
                  placeholder="What does it print?"
                  className="cg-focusable h-11 w-full rounded-cg border border-line bg-card px-3.5 font-mono text-ink placeholder:font-sans placeholder:text-faint-nontext hover:border-line-strong focus-visible:border-accent"
                />
              </div>
            </>
          )}

          {activeGameType === 'CodeFix' && (
            <>
              {question.codeLines.map((line, index) => {
                const isTarget = index === question.buggyLineIndex;
                return (
                  <div
                    key={index}
                    className={`flex gap-4 rounded-cg-sm px-2.5 py-1.5 ${
                      isTarget ? 'bg-danger/10 ring-1 ring-inset ring-danger/30' : ''
                    }`}
                  >
                    <span className="w-5 select-none text-right text-faint-nontext">
                      {index + 1}
                    </span>
                    <span className="whitespace-pre">{line}</span>
                  </div>
                );
              })}

              <div className="mt-5 border-t border-line pt-4">
                <label
                  htmlFor="fix"
                  className="mb-2 block font-sans text-sm font-semibold text-ink"
                >
                  Line {(question.buggyLineIndex ?? 0) + 1}, corrected
                </label>
                <textarea
                  id="fix"
                  rows={2}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  value={typeof state.answer === 'string' ? state.answer : ''}
                  onChange={(event) => dispatch({ type: 'ANSWER', answer: event.target.value })}
                  onKeyDown={(event) => {
                    // Enter checks; Shift+Enter still breaks the line, because a
                    // fix can legitimately span two.
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      if (!state.checking && state.phase === 'playing') void check();
                    }
                  }}
                  className="cg-focusable w-full resize-y rounded-cg border border-line bg-card px-3.5 py-2.5 font-mono text-ink placeholder:font-sans placeholder:text-faint-nontext hover:border-line-strong focus-visible:border-accent"
                />
                <p className="mt-1.5 font-sans text-xs text-muted">
                  Spacing does not matter. Everything else does.
                </p>

                {state.check && !state.check.correct && (
                  <div className="mt-3 flex gap-3 rounded-cg border border-danger/30 bg-danger/10 p-3.5">
                    <TriangleAlert
                      size={17}
                      strokeWidth={2.2}
                      aria-hidden
                      className="mt-0.5 shrink-0 text-danger"
                    />
                    <div className="font-sans text-sm">
                      <p className="font-semibold text-ink">
                        Not right yet
                        {state.check.wrongAttempts > 1
                          ? ` — ${state.check.wrongAttempts} tries so far`
                          : ''}
                      </p>
                      {state.check.hint && <p className="mt-1 text-body">{state.check.hint}</p>}
                    </div>
                  </div>
                )}

                {state.check?.correct && (
                  <div className="mt-3 flex items-center gap-3 rounded-cg border border-ok/30 bg-ok/10 p-3.5 font-sans text-sm">
                    <CircleCheck
                      size={17}
                      strokeWidth={2.2}
                      aria-hidden
                      className="shrink-0 text-ok"
                    />
                    <p className="font-semibold text-ink">That is the fix.</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </Card>

      {state.hintLevel > 0 && question.hints && (
        <Card className="flex gap-4 border-l-4 border-l-warn p-5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-cg bg-warn/10 text-warn">
            <Lightbulb size={18} strokeWidth={2.2} aria-hidden />
          </span>
          <div>
            <p className="font-bold text-ink">Hint {state.hintLevel} of 3</p>
            <p className="mt-1 text-body">{question.hints[state.hintLevel - 1]}</p>
          </div>
        </Card>
      )}

      {state.error && <FormError>{state.error}</FormError>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => dispatch({ type: 'HINT' })}
          disabled={state.hintLevel >= 3 || state.phase !== 'playing'}
          className={buttonClass({ variant: 'secondary' })}
        >
          <Lightbulb size={16} strokeWidth={2.2} aria-hidden />
          {/* The count is shown from the first hint on, because each one costs
              15 points and a student should be able to see the running cost
              before deciding to take another. */}
          Use a hint{state.hintLevel > 0 ? ` (${state.hintLevel}/3)` : ''}
        </button>

        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">
            {/* For CodeFix the count comes from the server, which has graded
                every attempt. For the others it is the local counter. */}
            {activeGameType === 'CodeFix' && state.check
              ? `${state.check.wrongAttempts} wrong so far`
              : `Attempt ${state.attemptCount}`}
          </span>

          {activeGameType === 'CodeFix' ? (
            <button
              type="button"
              onClick={check}
              disabled={
                state.checking ||
                state.phase !== 'playing' ||
                typeof state.answer !== 'string' ||
                !state.answer.trim()
              }
              className={buttonClass()}
            >
              {state.checking ? (
                <>
                  <Loader2 size={16} className="animate-spin" aria-hidden />
                  Checking…
                </>
              ) : (
                <>
                  <CircleCheck size={16} strokeWidth={2.2} aria-hidden />
                  Check my fix
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={state.answer === null || state.phase !== 'playing'}
              className={buttonClass()}
            >
              Submit answer
            </button>
          )}
        </div>
      </div>

      {result && (
        <Card
          // The round's outcome appears without focus moving, and it is
          // followed a couple of seconds later by an automatic navigation to
          // the results page - so a screen-reader user who is not told about
          // it simply finds themselves somewhere else.
          role="status"
          aria-live="polite"
          className={`flex gap-4 border-l-4 p-5 ${
            result.score > 0 ? 'border-l-ok' : 'border-l-warn'
          }`}
        >
          <span
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-cg ${
              result.score > 0 ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn'
            }`}
          >
            {result.score > 0 ? (
              <CircleCheck size={18} strokeWidth={2.2} aria-hidden />
            ) : (
              <Info size={18} strokeWidth={2.2} aria-hidden />
            )}
          </span>

          <div>
            <p className={`font-bold ${result.score > 0 ? 'text-ok' : 'text-warn'}`}>
              {result.score > 0
                ? `Nice work — ${result.score} points.`
                : 'Attempt recorded. Worth another go at this one.'}
            </p>
            {(result.learnerFeedback || result.explanation) && (
              <p className="mt-1 text-body">
                {result.learnerFeedback ?? result.explanation}
              </p>
            )}
            <p className="mt-2 flex items-center gap-1.5 text-sm text-muted">
              <Loader2 size={13} className="animate-spin" aria-hidden />
              Taking you to your results…
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
