/**
 * A student's plan, as the proxy sees it, and the enforcement of plan-gate.ts.
 *
 * Server only: it calls Code Coach with the student's own platform token.
 *
 * The plan is cached for a few seconds per token. A dashboard fans out to
 * several services at once, and asking Code Coach once per proxied request
 * would double the traffic for an answer that changes once a month. Any
 * request to Code Coach's /billing/* through the proxy drops the entry, so the
 * moment a student upgrades or cancels, the next request sees it.
 *
 * ================= WHEN CODE COACH CANNOT ANSWER =================
 * The check fails OPEN: an unknown plan is treated as Pro. A student who has
 * paid must never be locked out of what they paid for by our own outage, and
 * the only cost of the other way round is a Free student getting a Pro
 * feature for the few seconds Code Coach is down - while it is down, signing
 * in does not work either.
 * ================================================================
 */

import { LOCKED_MESSAGE, type GateDecision, type ProFeature, quizUnlocked } from './plan-gate';
import { upstreamUrl } from './upstream';

export type Tier = 'free' | 'pro';

interface Billing {
  plan: { tier: Tier };
  free_lessons: { used: number; limit: number; unlocked: Array<{ error_type?: string | null; concept_tag?: string | null }> };
}

const TTL_MS = 15_000;
const TIMEOUT_MS = 6_000;
const cache = new Map<string, { at: number; billing: Billing }>();

export function forgetPlan(token: string): void {
  cache.delete(token);
}

async function billingFor(token: string): Promise<Billing | null> {
  const hit = cache.get(token);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.billing;

  try {
    const response = await fetch(upstreamUrl('coach', '/billing/me', ''), {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const billing = (await response.json()) as Billing;
    if (cache.size > 5_000) cache.clear(); // tokens rotate hourly; never grow without bound
    cache.set(token, { at: Date.now(), billing });
    return billing;
  } catch (error) {
    console.warn('plan: Code Coach did not say which plan this student has:', error);
    return null;
  }
}

export async function tierFor(token: string): Promise<Tier | null> {
  const tier = (await billingFor(token))?.plan?.tier;
  return tier === 'free' || tier === 'pro' ? tier : null;
}

export interface Refusal {
  status: 402;
  body: { detail: string; upgrade: true; feature: ProFeature };
}

const refuse = (feature: ProFeature, detail = LOCKED_MESSAGE[feature]): Refusal => ({
  status: 402,
  body: { detail, upgrade: true, feature },
});

/** Null to let the request through, or the refusal to send instead. */
export async function enforce(decision: GateDecision, token: string): Promise<Refusal | null> {
  switch (decision.kind) {
    case 'allow':
    case 'strip-feedback':
      return null;

    case 'pro': {
      const tier = await tierFor(token);
      return tier === 'free' ? refuse(decision.feature) : null;
    }

    case 'lesson': {
      // Code Coach decides and records: it knows how many this student has
      // opened this month, and says yes at once for Pro.
      try {
        const response = await fetch(upstreamUrl('coach', '/billing/me/lesson-unlocks', ''), {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            trigger_id: decision.triggerId,
            error_type: decision.errorType,
            concept_tag: decision.conceptTag,
          }),
          cache: 'no-store',
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        forgetPlan(token);
        if (response.status === 402) {
          const body = (await response.json().catch(() => ({}))) as { detail?: string };
          return refuse('lessons', body.detail || LOCKED_MESSAGE.lessons);
        }
        return null;
      } catch (error) {
        console.warn('plan: could not check the free lesson quota, letting the lesson open:', error);
        return null;
      }
    }

    case 'quiz': {
      const billing = await billingFor(token);
      if (!billing || billing.plan?.tier !== 'free') return null;
      return quizUnlocked(decision.errorType, billing.free_lessons?.unlocked ?? [])
        ? null
        : refuse('lessons', 'Open this lesson first - its quiz comes with it. Pro unlocks every lesson and quiz.');
    }
  }
}
