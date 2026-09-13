/**
 * Report a finished pair session to Code Coach, for the student asking.
 *
 * ======================= WHY IT RUNS HERE =======================
 * Two services, two credentials, and only this layer holds both.
 *
 * PairPath knows what happened in the session but holds only its own token,
 * so it cannot speak to Code Coach as the student. Code Coach is where the
 * outcome has to land - it is what moves concept mastery and opens Study
 * Guider lessons - and it accepts only the platform token. The session cookie
 * carries both, so this handler reads the outcome with one and writes it with
 * the other, and the browser only ever says which session to report.
 *
 * The gamification engine reaches Code Coach by being handed the platform
 * token through the proxy. PairPath cannot be: its runs happen over a socket
 * the proxy never sees.
 * ================================================================
 */

import { NextRequest, NextResponse } from 'next/server';

import { exchangeForPairPath } from '@/lib/code-coach';
import { SESSION_COOKIE, cookieOptions, sealSession, unsealSession } from '@/lib/session';
import { upstreamUrl } from '@/lib/upstream';

const TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 8000);

/** PairPath's GET /sessions/:id/outcome - see session-outcome.ts there. */
interface Outcome {
  sessionId: string;
  status: string;
  questionId: string;
  conceptTags: string[];
  difficulty: string | null;
  errorType: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  gradedRunCount: number;
  correctRunCount: number;
  solved: boolean | null;
  secondsToSolve: number | null;
  reviewScorePercent: number | null;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const session = await unsealSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ detail: 'Not signed in.' }, { status: 401 });
  }

  let refreshedCookie: string | null = null;
  const respond = (body: unknown, status: number) => {
    const response = NextResponse.json(body, { status });
    if (refreshedCookie) response.cookies.set(SESSION_COOKIE, refreshedCookie, cookieOptions());
    return response;
  };

  try {
    // ── 1. What happened, from PairPath ─────────────────────────────────────
    const readOutcome = (token: string) =>
      fetch(upstreamUrl('pair', `/sessions/${encodeURIComponent(id)}/outcome`, ''), {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

    let pairResponse = session.pairPathToken ? await readOutcome(session.pairPathToken) : null;

    // Absent or expired: the same repair the proxy makes. A PairPath token
    // lives an hour, and this runs at the end of what can be a long session.
    if (!pairResponse || pairResponse.status === 401) {
      const exchanged = await exchangeForPairPath(session.accessToken);
      if (!exchanged) {
        return respond({ recorded: false, reason: 'pairpath_unavailable' }, 503);
      }
      session.pairPathToken = exchanged.token;
      session.pairPathUserId = exchanged.userId;
      refreshedCookie = await sealSession(session);
      pairResponse = await readOutcome(exchanged.token);
    }

    if (!pairResponse.ok) {
      return respond({ recorded: false, reason: 'outcome_unavailable' }, pairResponse.status);
    }
    const outcome = (await pairResponse.json()) as Outcome;

    // Only a session the pair actually finished. An active one has no outcome
    // yet, and an expired one was abandoned - which is not evidence of anything.
    if (outcome.status !== 'COMPLETED') {
      return respond({ recorded: false, reason: 'not_finished' }, 409);
    }
    if (!outcome.conceptTags.length) {
      return respond({ recorded: false, reason: 'no_concepts' }, 200);
    }

    const toCoach = (path: string, body: unknown) =>
      fetch(upstreamUrl('coach', path, ''), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        cache: 'no-store',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

    // ── 2. A Code Coach learning session to record it against ──────────────
    // Create-or-resume, keyed by component and exercise, so a repeat report
    // reuses one instead of minting a new session per visit.
    const learning = await toCoach('/learning-sessions', {
      source_component: 'collaborative_studio',
      language: 'java',
      task_id: outcome.questionId,
    });
    if (!learning.ok) {
      return respond({ recorded: false, reason: 'code_coach_unavailable' }, 502);
    }
    const { learning_session_id: learningSessionId } = (await learning.json()) as {
      learning_session_id: string;
    };

    // ── 3. The outcome itself ───────────────────────────────────────────────
    const recorded = await toCoach('/collaboration/me/pair-session-results', {
      learning_session_id: learningSessionId,
      pair_session_id: outcome.sessionId,
      task_id: outcome.questionId,
      concept_tags: outcome.conceptTags,
      error_type: outcome.errorType,
      difficulty_level: outcome.difficulty,
      solved: outcome.solved,
      // Graded runs, not every run. A run nobody could say was right or wrong
      // is not an attempt at the answer Code Coach is scoring.
      run_count: outcome.gradedRunCount,
      correct_run_count: outcome.correctRunCount,
      seconds_to_solve: outcome.secondsToSolve,
      duration_seconds: outcome.durationSeconds,
      review_score_percent: outcome.reviewScorePercent,
      occurred_at: outcome.endedAt,
    });
    if (!recorded.ok) {
      console.warn(`pair outcome: Code Coach refused session ${id} with ${recorded.status}`);
      return respond({ recorded: false, reason: 'code_coach_rejected' }, 502);
    }

    const result = (await recorded.json()) as {
      already_recorded?: boolean;
      trigger_ids?: string[];
    };
    return respond(
      {
        recorded: true,
        alreadyRecorded: Boolean(result.already_recorded),
        lessonOpened: (result.trigger_ids ?? []).length > 0,
      },
      200,
    );
  } catch (error) {
    console.warn(`pair outcome: could not report session ${id}:`, error);
    return respond({ recorded: false, reason: 'unreachable' }, 503);
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
