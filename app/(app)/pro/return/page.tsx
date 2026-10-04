'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { BookOpen, Gamepad2, Hourglass, Loader2, Users } from 'lucide-react';

import { loadPlan } from '@/lib/use-plan';
import { Confetti } from '@/components/arcade';
import { ProBadge } from '@/components/pro';
import { Card, buttonClass } from '@/components/ui';

/**
 * Where PayHere sends the student back after paying.
 *
 * Coming back here is NOT proof of payment - anyone can open this URL. Pro is
 * granted by PayHere's own notification to Code Coach, which usually lands a
 * second or two before or after the student does. So this page only waits
 * for Code Coach to say Pro, and shows it when it does.
 */

const POLL_MS = 2000;
const GIVE_UP_MS = 60_000;

function Waiting() {
  const params = useSearchParams();
  const demo = params.get('demo') === '1';
  const [state, setState] = useState<'waiting' | 'pro' | 'slow'>('waiting');
  const started = useRef(Date.now());

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const billing = await loadPlan(true);
      if (!live) return;
      if (billing?.plan.tier === 'pro') return setState('pro');
      if (Date.now() - started.current > GIVE_UP_MS) return setState('slow');
      timer = setTimeout(tick, POLL_MS);
    };
    tick();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, []);

  if (state === 'pro') {
    return (
      <Card className="relative overflow-visible px-6 py-12 text-center animate-cg-rise">
        <Confetti />
        <span className="mx-auto"><ProBadge label="Pro unlocked" className="px-3 py-1 text-xs" /></span>
        <h1 className="mt-4 text-2xl font-extrabold text-ink">Welcome to Code Guru Pro</h1>
        <p className="mx-auto mt-2 max-w-md text-body">
          {demo ? 'The demo payment went through.' : 'PayHere confirmed your payment.'} Everything is unlocked - here is
          where to start.
        </p>
        <div className="mx-auto mt-8 grid max-w-xl gap-3 sm:grid-cols-3">
          <Link href="/play" className={buttonClass({ variant: 'secondary' })}><Gamepad2 size={15} aria-hidden />Free play</Link>
          <Link href="/pair" className={buttonClass({ variant: 'secondary' })}><Users size={15} aria-hidden />Free coding</Link>
          <Link href="/study/progress" className={buttonClass({ variant: 'secondary' })}><BookOpen size={15} aria-hidden />Learning map</Link>
        </div>
        <Link href="/pro" className="mt-6 inline-block text-sm font-semibold text-accent hover:underline">Manage your plan</Link>
      </Card>
    );
  }

  return (
    <Card className="px-6 py-12 text-center" aria-live="polite">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-cg-lg bg-hue-play/15 text-warn">
        {state === 'slow' ? <Hourglass size={24} aria-hidden /> : <Loader2 size={24} className="animate-spin" aria-hidden />}
      </span>
      <h1 className="mt-5 text-xl font-bold text-ink">
        {state === 'slow' ? 'Still waiting for PayHere' : 'Confirming your payment…'}
      </h1>
      <p className="mx-auto mt-2 max-w-md text-body">
        {state === 'slow'
          ? 'PayHere has not confirmed the payment yet. If you were charged, Pro switches on as soon as it does - check back on the Pro page in a few minutes.'
          : 'PayHere tells Code Guru directly once the payment clears. This usually takes a few seconds.'}
      </p>
      {state === 'slow' && (
        <Link href="/pro" className={buttonClass({ variant: 'secondary', className: 'mt-6' })}>Go to the Pro page</Link>
      )}
    </Card>
  );
}

export default function ProReturnPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <Suspense fallback={<div className="cg-skeleton h-72 w-full" />}>
        <Waiting />
      </Suspense>
    </div>
  );
}
