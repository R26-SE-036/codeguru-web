'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
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
  /**
   * How many hints exist, NOT the hints themselves.
   *
   * They used to arrive with the question, so a student could read all three in
   * the network tab and still be recorded as having used none - while the score
   * charged 15 points each based on a count this component reported about
   * itself. They come one at a time from POST /game/hint now.
   */
  hintCount?: number;
  /** CodeFix only: the line the student has to rewrite. */
  buggyLineIndex?: number;
  /** Added by the backend: which engine chose the difficulty. */
  difficultyChosenBy?: string;
  difficultyConfidence?: number | null;
  difficultyReason?: string | null;
  targetDifficulty?: string;

  /**
   * The adaptation decision this game came from, to be echoed back on submit.
   *
   * Without it the backend has to GUESS which decision produced which outcome -
   * it falls back to the most recent unresolved decision for this student and
   * concept, and records the link as 'inferred'. calibration.js counts only
   * 'echo' rows by default, so an engine whose client does not send this back
   * can measure nothing about itself.
   *
   * Null when the caller named a difficulty, because then no decision was made.
   */
  decisionId?: string | null;

  /** Whether this round was served at an exploratory level. */
  wasExploratory?: boolean;
}

interface SubmitResult {
  score: number;
  /**
   * The wrong attempts the engine graded through /game/check. Forwarded to
   * Code Coach as `error_count`; absent from an engine older than this field.
   */
  errorCount?: number;
  learnerFeedback?: string;
  explanation?: string;
  /**
   * FR-10. What the student needs beyond another round, when anything.
   * `keep_going` means nothing is wrong and is not worth interrupting them for.
   */
  support?: {
    action: 'review_lesson' | 'extra_practice' | 'slow_down' | 'keep_going';
    headline: string;
    detail: string;
  } | null;
  nextRecommendedConcept?: string | null;
}

type Answer = number | number[] | string | null;

/**
 * How many questions one visit to a concept serves.
 *
 * ===================== WHY A RUN AND NOT ONE QUESTION =====================
 * A visit used to be a single question: play it, get a score, get pushed to a
 * results page. That is a thin experience, and it also starved almost every
 * adaptive mechanism this engine has, because all of them are defined over a
 * SEQUENCE of rounds and a student was only ever giving them one:
 *
 *   * FR-08's dual-threshold rule needs two consecutive sessions at a level
 *     before it moves anybody. At one round per visit a student had to come
 *     back three separate times to see the level change once.
 *   * FR-10's support rules read a window of the last five rounds. That window
 *     spanned days, so "three failures in a row - go and read the lesson"
 *     arrived long after the student had stopped struggling.
 *   * Exploration is 15%, about one round in seven. A student playing one round
 *     a visit could easily never meet one, and those rows are the only ones in
 *     the corpus free of the policy's own influence.
 *   * And the difficulty model gets one decision and one outcome per visit, so
 *     the 100 rows calibration.js needs before it will report anything were 100
 *     separate visits away.
 *
 * Each question in the run is a full round: a fresh call to the game endpoint,
 * so the difficulty is re-decided from history that now includes the round just
 * played, the format is re-chosen, and a new adaptation decision is recorded.
 * The engine adapts WITHIN a sitting rather than only between them, which is
 * what the proposal describes and what a student can actually notice.
 *
 * Five is a judgement: long enough for the progression rule to move somebody,
 * short enough to finish in one sitting. The student can stop after any round.
 */
const QUESTIONS_PER_RUN = 5;

/** One finished round, kept for the run summary. */
interface RunEntry {
  score: number;
  gameType: string;
  difficulty: string;
  seconds: number;
  hintLevel: number;
  attemptCount: number;
}

/**
 * The verdict on the last checked attempt.
 *
 * Checking is a server call, not a local comparison: the answer never reaches
 * the browser (see the backend's /game/check), which is also what makes the
 * error count a measurement rather than something this component reports about
 * itself.
 *
 * ================== WHY EVERY GAME CHECKS, NOT JUST CodeFix ==================
 * This was CodeFix-only, and the consequence was not a missing button. It was
 * that `errorCount` and `attemptCount` were MEASURED for one format out of four
 * and asserted for the other three - which quietly made them a proxy for the
 * format rather than for the student:
 *
 *   * the model's `avg_attempts` feature was 1 for every BugHunt, DragDrop and
 *     CodeTrace round ever played, so it encoded "was this CodeFix";
 *   * the proposal's own support rule, `errorCount > 5`, could only ever fire
 *     on a CodeFix round, because nothing else could record more than one;
 *   * and a student wrestling with a Drag & Drop looked identical in the data
 *     to one who got it first time.
 *
 * The backend never had this restriction - /game/check grades whatever the
 * question's own type says, and has since it was written. Only this file did.
 */
interface CheckState {
  correct: boolean;
  hint: string | null;
  wrongAttempts: number;
  /** The server's count of attempts on this question, including this one. */
  attemptNumber: number;
}

interface State {
  question: Question | null;
  answer: Answer;
  /** The hints the server has actually handed over, in order. */
  hints: string[];
  hintsRemaining: number;
  takingHint: boolean;
  hintLevel: number;
  check: CheckState | null;
  checking: boolean;
  attemptCount: number;
  seconds: number;
  phase: 'loading' | 'playing' | 'submitted';
  error: string | null;
}

type Action =
  | { type: 'LOADING' }
  | { type: 'INIT'; question: Question }
  | { type: 'ANSWER'; answer: Answer }
  | { type: 'HINT_PENDING' }
  | { type: 'HINT'; hint: string; taken: number; remaining: number }
  | { type: 'CHECKING' }
  | { type: 'CHECKED'; check: CheckState }
  | { type: 'TICK' }
  | { type: 'SUBMIT' }
  | { type: 'ERROR'; message: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'LOADING':
      // The question is cleared so the skeleton shows rather than the round
      // just finished, which would otherwise sit there looking playable.
      return { ...state, phase: 'loading', question: null, answer: null, check: null, error: null };
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
        hints: [],
        hintLevel: 0,
        hintsRemaining: action.question.hintCount ?? 0,
        // Reset explicitly, because INIT now runs between the questions of a
        // run as well as at the start of one. Carrying the previous round's
        // clock or attempt count into the next would report the wrong numbers
        // to the engine - and they are the numbers the score is computed from.
        seconds: 0,
        attemptCount: 1,
        checking: false,
        takingHint: false,
      };
    }
    case 'ANSWER':
      // Editing clears the previous verdict. Leaving a red "not right" under a
      // line the student has since changed reads as a judgement on the new text.
      return { ...state, answer: action.answer, check: null };
    case 'CHECKING':
      return { ...state, checking: true };
    case 'CHECKED':
      return {
        ...state,
        checking: false,
        check: action.check,
        // The SERVER's count, not a local increment - it is the one the score is
        // computed from, and it survives a refresh because it lives in a
        // GameAttempt document rather than in this component.
        attemptCount: action.check.attemptNumber || state.attemptCount,
      };
    case 'HINT_PENDING':
      return { ...state, takingHint: true };
    case 'HINT': {
      // Deduplicated: asking again for a hint already taken returns the same
      // text and must not add a second copy or a second point of cost.
      const hints = state.hints.includes(action.hint)
        ? state.hints
        : [...state.hints, action.hint];

      return {
        ...state,
        takingHint: false,
        hints,
        // The server's count, not a local increment - it is the one the score
        // is computed from.
        hintLevel: action.taken,
        hintsRemaining: action.remaining,
      };
    }
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
    hints: [],
    hintsRemaining: 0,
    takingHint: false,
    hintLevel: 0,
    check: null,
    checking: false,
    attemptCount: 1,
    seconds: 0,
    phase: 'loading',
    error: null,
  });
  const [result, setResult] = useState<SubmitResult | null>(null);

  /**
   * The rounds finished so far in this run.
   *
   * Held here rather than in the reducer because it survives INIT - the reducer
   * resets per question, and this is the one thing that must not.
   */
  const [run, setRun] = useState<RunEntry[]>([]);
  const [loadingNext, setLoadingNext] = useState(false);
  const learningSessionId = useRef<string | null>(null);

  const dragFrom = useRef<number | null>(null);
  const dragTo = useRef<number | null>(null);

  /** The row a keyboard move should leave focused, applied after the render. */
  const focusPosition = useRef<number | null>(null);

  /**
   * Move one line up or down in the ordering.
   *
   * Drag & Drop was mouse-only: the rows were `draggable` divs with pointer
   * handlers and nothing else, so a student who cannot use a mouse could not
   * play that game AT ALL. NFR-04 targets a usability score of 68 and nobody
   * had tested it; this would have failed an accessibility review outright.
   *
   * Arrow keys move the focused line. That is the standard keyboard equivalent
   * for a reorderable list, and it needs no drag mode to enter or leave.
   */
  const moveLine = useCallback(
    (position: number, delta: number) => {
      if (!Array.isArray(state.answer)) return;

      const target = position + delta;
      if (target < 0 || target >= state.answer.length) return;

      const next = [...state.answer];
      [next[position], next[target]] = [next[target], next[position]];
      dispatch({ type: 'ANSWER', answer: next });

      // Follow the line the student just moved, so a second press continues
      // moving the same one.
      //
      // Recorded for an effect to act on AFTER the render rather than focused
      // here: React replaces the row with a new DOM node, so anything that runs
      // before the commit focuses an element that is about to be discarded.
      // requestAnimationFrame was not late enough - the first press worked and
      // focus was then lost, which would have meant re-focusing by hand between
      // every single move.
      focusPosition.current = target;
    },
    [state.answer],
  );

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

  /**
   * Whether there is an answer worth sending.
   *
   * The four games hold their answer in three different shapes - a line index,
   * an ordering, a typed string - and both Check and Submit need the same test.
   * Written once so the two buttons cannot disagree about whether the round is
   * ready, which is the kind of drift that leaves one of them permanently
   * disabled.
   */
  const hasAnswer =
    state.answer !== null &&
    (typeof state.answer !== 'string' || state.answer.trim().length > 0);
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

  /**
   * Fetch the next question of the run.
   *
   * A FULL round, not a second question drawn from the first decision: the game
   * endpoint re-decides the difficulty from history that now includes the round
   * just played, re-chooses the format, avoids the questions this student has
   * recently seen, and records a new adaptation decision. That is the whole
   * point of a run - the engine adapts between the questions of one sitting,
   * where a student can actually notice it doing so.
   *
   * The learning session is deliberately NOT recreated. One run is one sitting,
   * and it is what groups these rounds together for Code Coach.
   */
  const nextQuestion = useCallback(async () => {
    setLoadingNext(true);
    setResult(null);
    dispatch({ type: 'LOADING' });

    try {
      const question = await api.get<Question>(
        'play',
        `/game/${userId}/${gameType}/${conceptTag}/${difficulty}`,
      );
      dispatch({ type: 'INIT', question });
    } catch (error) {
      dispatch({
        type: 'ERROR',
        message:
          error instanceof ApiError && error.isUnavailable
            ? 'Practice is unavailable right now. Please try again shortly.'
            : 'We could not load the next question.',
      });
    } finally {
      setLoadingNext(false);
    }
  }, [userId, gameType, conceptTag, difficulty]);

  /**
   * End the run and show the summary.
   *
   * `entries` is passed in rather than read from state because the caller has
   * just appended to it and a state update is not visible to the same tick -
   * reading `run` here would silently drop the final round from the summary.
   */
  const finishRun = useCallback(
    (entries: RunEntry[], last: SubmitResult) => {
      sessionStorage.setItem(
        'codeguru.lastGameResult',
        JSON.stringify({
          result: last,
          conceptTag,
          gameType: entries[entries.length - 1]?.gameType ?? activeGameType,
          difficulty: entries[entries.length - 1]?.difficulty ?? activeDifficulty,
          attemptCount: entries[entries.length - 1]?.attemptCount ?? 1,
          hintLevel: entries[entries.length - 1]?.hintLevel ?? 0,
          seconds: entries[entries.length - 1]?.seconds ?? 0,
          // The whole run. The results page shows the summary when there is
          // more than one round and falls back to the single-round view
          // otherwise, so an interrupted run still reads correctly.
          run: entries,
        }),
      );

      router.push('/play/results');
    },
    [conceptTag, activeGameType, activeDifficulty, router],
  );

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

  // Restore focus to the row the student just moved. Runs after every commit,
  // and does nothing unless a keyboard move asked for it - a mouse drag should
  // not steal focus.
  useEffect(() => {
    if (focusPosition.current === null) return;

    const target = focusPosition.current;
    focusPosition.current = null;
    document.querySelector<HTMLElement>(`[data-order-position="${target}"]`)?.focus();
  });

  /**
   * Ask for the next hint.
   *
   * A request rather than a local counter, because the hints are not here: the
   * question arrives with only `hintCount`. The server hands over the next one
   * the student has not seen and records it, which is what makes `hintUsage` a
   * measurement rather than something this component asserts about itself.
   *
   * Never throws. A student who cannot get a hint should still be able to play.
   */
  async function takeHint() {
    if (!state.question || state.takingHint || state.hintsRemaining <= 0) return;

    dispatch({ type: 'HINT_PENDING' });

    try {
      const result = await api.post<{
        hint: string | null;
        hintsTaken: number;
        hintsRemaining: number;
      }>('play', '/game/hint', {
        userId,
        learningSessionId: learningSessionId.current,
        questionId: state.question.id,
      });

      if (result.hint) {
        dispatch({
          type: 'HINT',
          hint: result.hint,
          taken: result.hintsTaken,
          remaining: result.hintsRemaining,
        });
      } else {
        dispatch({ type: 'HINT', hint: '', taken: state.hintLevel, remaining: 0 });
      }
    } catch {
      dispatch({
        type: 'HINT',
        hint: 'Could not fetch a hint just now.',
        taken: state.hintLevel,
        remaining: state.hintsRemaining,
      });
    }
  }

  /**
   * Ask the server whether this answer is right, WITHOUT ending the round.
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
   *
   * ===================== CHECKING IS NOT A FREE RETRY =====================
   * There is no cap on checks and none is needed, because the score already
   * prices them: every attempt after the first costs 10 points, so a student
   * clicking through all six lines of a Bug Hunt arrives at the right one with
   * 50 - below the 70 pass mark. Guessing is possible and self-defeating, which
   * is the correct shape for a practice tool. A cap would instead produce a
   * round the student can no longer finish.
   */
  async function check() {
    if (!state.question || !hasAnswer) return;

    dispatch({ type: 'CHECKING' });

    try {
      const verdict = await api.post<{
        correct: boolean;
        attemptNumber: number;
        wrongAttempts: number;
        hintsRemaining: number;
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
          // No hint arrives here any more. Checking is free; a hint costs 15
          // points, so it has to be asked for rather than handed over because
          // an attempt happened to be wrong.
          hint: null,
          wrongAttempts: verdict.wrongAttempts ?? 0,
          attemptNumber: verdict.attemptNumber ?? state.attemptCount,
        },
      });

      if (verdict.correct) await submit();
    } catch {
      // Checking is a convenience; failing it must not strand the student. They
      // can still submit, which grades the same answer the same way.
      dispatch({
        type: 'CHECKED',
        check: {
          correct: false,
          hint: 'Could not reach the checker. You can still submit.',
          wrongAttempts: 0,
          attemptNumber: state.attemptCount,
        },
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

        // Echoed back so the engine can join this outcome to the decision that
        // produced it. Without them the join is a guess ('inferred') and the
        // exploratory rows - the only ones free of the policy's own influence -
        // are indistinguishable from the rest.
        decisionId: state.question.decisionId ?? null,
        wasExploratory: state.question.wasExploratory === true,
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
            //
            // The engine's measured count, not one derived from the score:
            // `score > 0 ? 0 : 1` meant Code Coach's mastery error penalty only
            // ever saw 0 or 1. The derived value stays as the fallback for an
            // engine that does not return the count. Capped at 100 because
            // Code Coach rejects anything higher, and checks are unlimited.
            error_count: Math.min(100, submitted.errorCount ?? (submitted.score > 0 ? 0 : 1)),
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

      const entries = [
        ...run,
        {
          score: submitted.score,
          gameType: activeGameType,
          difficulty: activeDifficulty,
          seconds: state.seconds,
          hintLevel: state.hintLevel,
          attemptCount: state.attemptCount,
        },
      ];
      setRun(entries);

      // The last round of the run goes straight to the summary. Earlier ones
      // stop here and wait: the student reads their score and any support
      // message, then presses Next when they are ready.
      //
      // This used to be an unconditional setTimeout(..., 2500) - a two and a
      // half second window to read feedback before being navigated away from
      // it, which is not long enough for the one round in the run where the
      // feedback actually matters.
      if (entries.length >= QUESTIONS_PER_RUN) {
        setTimeout(() => finishRun(entries, submitted), 2000);
      }
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
          {/* Where they are in the run. Shown from the start rather than only
              once a round is done, because "question 1 of 5" is what tells a
              student this is a set and not a single question they can leave. */}
          <Badge tone="neutral">
            {/* While a finished round is still on screen the student is looking
                at question N, not N+1 - the run has been appended to but they
                have not moved on yet. Counting ahead here labelled the code
                they were still reading with the next question's number. */}
            Question{' '}
            {Math.min(
              state.phase === 'submitted' ? run.length : run.length + 1,
              QUESTIONS_PER_RUN,
            )}{' '}
            of {QUESTIONS_PER_RUN}
          </Badge>
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
          {activeGameType === 'DragDrop' && 'Put the lines into a correct order'}
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

          {activeGameType === 'DragDrop' && Array.isArray(state.answer) && (
            <>
              {/* Said out loud, not left to be discovered. A student who cannot
                  drag has no way to guess that arrow keys work unless told. */}
              <p className="mb-2 px-2.5 font-sans text-xs text-muted">
                Drag a line, or focus one and use the up and down arrow keys.
              </p>
              <ul
                // A list, because that is what it is - a screen reader announces
                // the length and the position, which is most of what a sighted
                // student gets from seeing the rows stacked.
                aria-label="Code lines. Use the arrow keys to reorder."
                className="space-y-0.5"
              >
              {state.answer.map((originalIndex, position) => (
                <li
                  key={`${originalIndex}-${position}`}
                  data-order-position={position}
                  tabIndex={0}
                  draggable
                  onDragStart={() => (dragFrom.current = position)}
                  onDragEnter={() => (dragTo.current = position)}
                  onDragEnd={onDrop}
                  onDragOver={(event) => event.preventDefault()}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowUp') {
                      event.preventDefault();
                      moveLine(position, -1);
                    } else if (event.key === 'ArrowDown') {
                      event.preventDefault();
                      moveLine(position, 1);
                    }
                  }}
                  aria-label={`Line ${position + 1} of ${
                    (state.answer as number[]).length
                  }: ${question.codeLines[originalIndex]}`}
                  className="cg-focusable group flex cursor-grab items-center gap-3 rounded-cg-sm px-2.5 py-1.5 transition hover:bg-card/70 active:cursor-grabbing"
                >
                  <GripVertical
                    size={15}
                    aria-hidden
                    className="shrink-0 text-faint-nontext transition group-hover:text-muted"
                  />
                  <span className="w-5 shrink-0 select-none text-right text-faint-nontext">
                    {position + 1}
                  </span>
                  <span className="whitespace-pre">{question.codeLines[originalIndex]}</span>
                </li>
                ))}
              </ul>
            </>
          )}

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

              </div>
            </>
          )}
        </div>
      </Card>

      {/* The verdict on the last check, for whichever game is being played.
          It used to live inside the CodeFix branch, which is why the other
          three had no way to be told anything short of their final score. */}
      {state.check && (
        <Card
          // Announced, because a student who checks with the keyboard gets no
          // other signal that anything happened.
          role="status"
          aria-live="polite"
          className={`flex gap-4 border-l-4 p-5 ${
            state.check.correct ? 'border-l-ok' : 'border-l-danger'
          }`}
        >
          <span
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-cg ${
              state.check.correct ? 'bg-ok/10 text-ok' : 'bg-danger/10 text-danger'
            }`}
          >
            {state.check.correct ? (
              <CircleCheck size={18} strokeWidth={2.2} aria-hidden />
            ) : (
              <TriangleAlert size={18} strokeWidth={2.2} aria-hidden />
            )}
          </span>
          <div className="text-sm">
            <p className="font-bold text-ink">
              {state.check.correct
                ? 'That is right.'
                : `Not right yet${
                    state.check.wrongAttempts > 1
                      ? ` — ${state.check.wrongAttempts} tries so far`
                      : ''
                  }`}
            </p>
            {state.check.hint ? (
              <p className="mt-1 text-body">{state.check.hint}</p>
            ) : (
              !state.check.correct && (
                // Said plainly, because the cost is the reason checking is not a
                // free retry and a student deciding whether to guess again
                // should know the price before they pay it.
                <p className="mt-1 text-body">
                  Change your answer and check again — each try after the first
                  costs 10 points.
                </p>
              )
            )}
          </div>
        </Card>
      )}

      {state.hints.length > 0 && (
        <Card className="flex gap-4 border-l-4 border-l-warn p-5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-cg bg-warn/10 text-warn">
            <Lightbulb size={18} strokeWidth={2.2} aria-hidden />
          </span>
          <div>
            <p className="font-bold text-ink">
              {state.hints.length === 1
                ? 'Hint'
                : `Hints (${state.hints.length} of ${question.hintCount ?? state.hints.length})`}
            </p>
            {/* Every hint taken stays on screen. They are ordered from general
                to explicit, so the earlier ones are the ones worth re-reading -
                and the student has paid for them. */}
            <ul className="mt-1 space-y-1.5 text-body">
              {state.hints.map((hint, index) => (
                <li key={index} className="flex gap-2">
                  <span className="text-faint-nontext" aria-hidden>
                    {index + 1}.
                  </span>
                  <span>{hint}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      {state.error && <FormError>{state.error}</FormError>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={takeHint}
          disabled={
            state.takingHint || state.hintsRemaining <= 0 || state.phase !== 'playing'
          }
          className={buttonClass({ variant: 'secondary' })}
        >
          <Lightbulb size={16} strokeWidth={2.2} aria-hidden />
          {/* The running cost is shown from the first hint on, because each one
              is 15 points and a student should see what they have spent before
              deciding to spend more. */}
          {state.hintsRemaining <= 0 && state.hintLevel > 0
            ? `No hints left (${state.hintLevel} used)`
            : `Use a hint${state.hintLevel > 0 ? ` (${state.hintLevel} used)` : ''}`}
        </button>

        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">
            {/* The server's count once anything has been checked - it graded
                those attempts, so it is the one the score comes from. */}
            {state.check
              ? `${state.check.wrongAttempts} wrong so far`
              : `Attempt ${state.attemptCount}`}
          </span>

          {/*
            Both buttons, for every game.

            CHECK grades without ending the round, so a wrong answer becomes a
            recorded attempt the student can learn from rather than a finished
            round scoring zero.

            SUBMIT ends it either way, and it has to exist for every format -
            CodeFix had only Check, which meant a student who could not work out
            the fix had NO WAY to finish. Every one of those rounds went down as
            abandoned, so the corpus for that format kept its successes and lost
            its failures. A component that measures itself cannot afford a
            silent filter like that in its own UI.
          */}
          <button
            type="button"
            onClick={check}
            disabled={state.checking || state.phase !== 'playing' || !hasAnswer}
            className={buttonClass({ variant: 'secondary' })}
          >
            {state.checking ? (
              <>
                <Loader2 size={16} className="animate-spin" aria-hidden />
                Checking…
              </>
            ) : (
              <>
                <CircleCheck size={16} strokeWidth={2.2} aria-hidden />
                Check answer
              </>
            )}
          </button>

          <button
            type="button"
            onClick={submit}
            disabled={state.checking || state.phase !== 'playing' || !hasAnswer}
            className={buttonClass()}
          >
            Submit answer
          </button>
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
            {/* Support, when there is something to act on. `keep_going` is
                deliberately not shown - telling a student who is doing fine
                that they are doing fine is noise, and it would train them to
                skip the panel on the round where it matters. */}
            {result.support && result.support.action !== 'keep_going' && (
              <div className="mt-3 rounded-cg border border-warn/30 bg-warn/10 p-3.5 text-left">
                <p className="flex items-center gap-2 text-sm font-bold text-ink">
                  <Lightbulb size={15} strokeWidth={2.4} aria-hidden className="text-warn" />
                  {result.support.headline}
                </p>
                <p className="mt-1 text-sm text-body">{result.support.detail}</p>

                {result.support.action === 'review_lesson' && (
                  <Link
                    href={`/study${
                      result.nextRecommendedConcept
                        ? `?concept=${encodeURIComponent(result.nextRecommendedConcept)}`
                        : ''
                    }`}
                    className={buttonClass({ variant: 'secondary', size: 'sm', className: 'mt-3' })}
                  >
                    <BookOpen size={15} strokeWidth={2.2} aria-hidden />
                    Open the lesson
                  </Link>
                )}
              </div>
            )}

            {run.length >= QUESTIONS_PER_RUN ? (
              <p className="mt-3 flex items-center gap-1.5 text-sm text-muted">
                <Loader2 size={13} className="animate-spin" aria-hidden />
                Taking you to your results…
              </p>
            ) : (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={nextQuestion}
                  disabled={loadingNext}
                  className={buttonClass()}
                >
                  {loadingNext ? (
                    <>
                      <Loader2 size={16} className="animate-spin" aria-hidden />
                      Loading…
                    </>
                  ) : (
                    <>
                      Next question
                      <ArrowRight size={16} strokeWidth={2.2} aria-hidden />
                    </>
                  )}
                </button>

                {/* Stopping early is a first-class option, not an escape. A
                    student who has read a "go back to the lesson" message
                    should be able to act on it immediately, and the rounds
                    they did play are already recorded. */}
                <button
                  type="button"
                  onClick={() => finishRun(run, result)}
                  className={buttonClass({ variant: 'secondary' })}
                >
                  Finish here
                </button>

                <span className="text-sm text-muted">
                  {QUESTIONS_PER_RUN - run.length} left in this set
                </span>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
