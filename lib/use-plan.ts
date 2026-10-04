'use client';

import { useCallback, useEffect, useState } from 'react';

import { api } from './api';

/** Code Coach's GET /billing/me - see app/api/routes/billing.py there. */
export interface Billing {
  plan: {
    tier: 'free' | 'pro';
    status: 'free' | 'active' | 'cancelled';
    provider: 'payhere' | 'demo' | null;
    renews_at: string | null;
    ends_at: string | null;
    cancel_at_period_end: boolean;
    started_at: string | null;
  };
  price: { amount: number; currency: string; interval: string };
  free_lessons: { used: number; limit: number; unlocked: Array<{ trigger_id: string }> };
  payments: Array<{ status: string; provider: string; amount: string | null; currency: string | null; created_at: string }>;
  checkout: { payhere: boolean; demo: boolean; sandbox: boolean };
}

/*
 * One request per page load, shared by every component that asks. The
 * sidebar badge, a locked card and the Pro page all want the same answer at
 * the same moment, and each fetching it would be three identical requests.
 */
let shared: Promise<Billing | null> | null = null;
const listeners = new Set<(billing: Billing | null) => void>();

export function loadPlan(force = false): Promise<Billing | null> {
  if (!shared || force) {
    shared = api.get<Billing>('coach', '/billing/me').catch(() => null);
    shared.then((billing) => listeners.forEach((listen) => listen(billing)));
  }
  return shared;
}

/**
 * The student's plan. `billing` is undefined while loading and null when Code
 * Coach could not say - in which case nothing is shown as locked: the proxy
 * fails open in the same situation (see lib/plan.ts), and the UI agrees.
 */
export function usePlan() {
  const [billing, setBilling] = useState<Billing | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    const listen = (next: Billing | null) => live && setBilling(next);
    listeners.add(listen);
    loadPlan().then(listen);
    return () => {
      live = false;
      listeners.delete(listen);
    };
  }, []);

  const refresh = useCallback(() => loadPlan(true), []);

  return {
    billing,
    loading: billing === undefined,
    isPro: billing?.plan.tier === 'pro',
    /** Free and known to be: the only case in which anything is shown locked. */
    isFree: billing?.plan.tier === 'free',
    refresh,
  };
}

export function formatLkr(amount: number): string {
  return `LKR ${amount.toLocaleString('en-LK')}`;
}
