'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, api } from '@/lib/api';
import { describeDifficultySource, formatConcept, formatGameType } from '@/lib/vocabulary';

/**
 * Ported from adaptive-gamification-engine GamePlayer.jsx.
 *
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

interface State {
  question: Question | null;
  answer: Answer;
  hintLevel: number;
  attemptCount: number;
  seconds: number;
  phase: 'loading' | 'playing' | 'submitted';
  error: string | null;
}

type Action =
  | { type: 'INIT'; question: Question }
  | { type: 'ANSWER'; answer: Answer }
  | { type: 'HINT' }
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
      const answer: Answer =
        action.question.gameType === 'DragDrop'
          ? action.question.codeLines.map((_, index) => index)
          : action.question.gameType === 'CodeTrace'
            ? ''
            : null;
      return { ...state, question: action.question, answer, phase: 'playing', error: null };
    }
    case 'ANSWER':
      return { ...state, answer: action.answer };
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
    return <p className="text-muted">Loading your practice…</p>;
  }

  const question = state.question;

  if (!question) {
    return (
      <div className="rounded-cg border border-line bg-card p-6">
        <p className="text-danger">{state.error ?? 'No activity available.'}</p>
      </div>
    );
  }

  const chosenBy = describeDifficultySource(question.difficultyChosenBy);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">
            {formatGameType(activeGameType)}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {formatConcept(conceptTag)} · {activeDifficulty}
            {chosenBy ? ` — ${chosenBy}` : ''}
          </p>
        </div>
        <span className="font-mono text-sm text-muted">{state.seconds}s</span>
      </header>

      <section className="rounded-cg border border-line bg-card p-5">
        <h2 className="border-b border-line pb-3 text-body">
          {activeGameType === 'BugHunt' && 'Find the line with the mistake:'}
          {activeGameType === 'DragDrop' && 'Drag the lines into a correct order:'}
          {activeGameType === 'CodeTrace' && 'Trace the code and give the final output:'}
        </h2>

        <div className="mt-4 overflow-x-auto rounded-cg bg-inset p-3 font-mono text-sm">
          {activeGameType === 'BugHunt' &&
            question.codeLines.map((line, index) => (
              <button
                key={index}
                type="button"
                onClick={() => dispatch({ type: 'ANSWER', answer: index })}
                className={`flex w-full gap-4 rounded px-2 py-1 text-left transition ${
                  state.answer === index ? 'bg-accent/20 text-ink' : 'hover:bg-card-alt'
                }`}
              >
                <span className="select-none text-muted">{index + 1}</span>
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
                className="flex cursor-grab gap-4 rounded px-2 py-1 hover:bg-card-alt"
              >
                <span className="select-none text-muted">⠿</span>
                <span className="whitespace-pre">{question.codeLines[originalIndex]}</span>
              </div>
            ))}

          {activeGameType === 'CodeTrace' && (
            <>
              {question.codeLines.map((line, index) => (
                <div key={index} className="flex gap-4 px-2 py-1">
                  <span className="select-none text-muted">{index + 1}</span>
                  <span className="whitespace-pre">{line}</span>
                </div>
              ))}
              <div className="mt-4 flex items-center gap-3">
                <label htmlFor="trace" className="font-sans text-body">
                  Final output:
                </label>
                <input
                  id="trace"
                  value={typeof state.answer === 'string' ? state.answer : ''}
                  onChange={(event) => dispatch({ type: 'ANSWER', answer: event.target.value })}
                  placeholder="What does it print?"
                  className="flex-1 rounded-cg border border-line bg-card px-3 py-2 font-sans text-ink"
                />
              </div>
            </>
          )}
        </div>
      </section>

      {state.hintLevel > 0 && question.hints && (
        <div className="rounded-cg border-l-4 border-warn bg-warn/10 px-4 py-3">
          <p className="text-body">
            <strong>Hint {state.hintLevel}:</strong> {question.hints[state.hintLevel - 1]}
          </p>
        </div>
      )}

      {state.error && (
        <p role="alert" className="rounded-cg bg-danger-soft px-4 py-3 text-danger">
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => dispatch({ type: 'HINT' })}
          disabled={state.hintLevel >= 3 || state.phase !== 'playing'}
          className="rounded-cg border border-line px-4 py-2 text-body transition hover:bg-card-alt disabled:opacity-50"
        >
          Use a hint {state.hintLevel > 0 ? `(${state.hintLevel}/3)` : ''}
        </button>

        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">Attempt {state.attemptCount}</span>
          <button
            type="button"
            onClick={submit}
            disabled={state.answer === null || state.phase !== 'playing'}
            className="rounded-cg bg-accent px-5 py-2 font-medium text-white transition hover:bg-accent-strong disabled:opacity-50"
          >
            Submit
          </button>
        </div>
      </div>

      {result && (
        <div
          className={`rounded-cg px-4 py-3 ${result.score > 0 ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn'}`}
        >
          <p className="font-medium">
            {result.score > 0
              ? `Nice work — ${result.score} points.`
              : 'Attempt recorded. Worth another go at this one.'}
          </p>
          {(result.learnerFeedback || result.explanation) && (
            <p className="mt-1 text-body">{result.learnerFeedback ?? result.explanation}</p>
          )}
          <p className="mt-2 text-sm text-muted">Taking you to your results…</p>
        </div>
      )}
    </div>
  );
}
