import Link from 'next/link';
import { Gamepad2, Puzzle, Sparkles, SquareCode, Users } from 'lucide-react';

import { Card, buttonClass } from '@/components/ui';

/**
 * What a brand-new account sees instead of four zeros.
 *
 * The dashboard is built entirely from things the student has already done, so
 * on day one every number on it is 0 and every list is empty. That is not
 * wrong, but it is useless: it reads as "you are up to date" when the truth is
 * "you have not started", and it never says what starting involves.
 *
 * It matters more than a normal empty state because of where the data comes
 * from. Nothing on this platform happens until the editor extension is
 * installed - the web app cannot see your code, so it has nothing to react to.
 * A student who does not know that will click every section, find each one
 * empty, and reasonably conclude the product is broken.
 */

const STEPS = [
  {
    icon: SquareCode,
    title: 'Install the extension in VS Code',
    body: 'Sign in with this same account. It is what watches your Java and finds the logic mistakes — the web app never sees your code on its own.',
    tone: 'text-hue-insight',
    bg: 'bg-hue-insight/10',
  },
  {
    icon: Puzzle,
    title: 'Write some Java',
    body: 'Mistakes get underlined as you type. Off-by-one loops, conditions that assign instead of compare, indexes that run past the end.',
    tone: 'text-hue-home',
    bg: 'bg-hue-home/10',
  },
  {
    icon: Sparkles,
    title: 'Repeat one, and a lesson appears',
    body: 'One slip is a slip. The same mistake twice is a pattern, and that is when a lesson written for your exact error shows up under Study.',
    tone: 'text-hue-study',
    bg: 'bg-hue-study/10',
  },
];

export function GettingStarted() {
  return (
    <div className="space-y-6">
      <Card className="relative overflow-hidden p-6 sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-hue-study/20 blur-3xl"
        />

        <div className="relative">
          <h2 className="text-xl font-bold tracking-tight text-ink">
            Three steps to your first lesson
          </h2>
          <p className="mt-2 max-w-2xl text-body">
            Everything here is built from mistakes you actually make, so there is
            nothing to show until you write some code.
          </p>

          <ol className="mt-7 space-y-6">
            {STEPS.map((step, index) => {
              const Icon = step.icon;

              return (
                <li key={step.title} className="flex gap-4">
                  <span className="relative flex flex-col items-center">
                    <span
                      className={`grid h-10 w-10 shrink-0 place-items-center rounded-cg ${step.bg} ${step.tone}`}
                    >
                      <Icon size={18} strokeWidth={2.2} aria-hidden />
                    </span>
                    {/* The connector stops at the last step rather than
                        trailing off under it. */}
                    {index < STEPS.length - 1 && (
                      <span aria-hidden className="mt-2 w-px flex-1 bg-line" />
                    )}
                  </span>

                  <div className="pb-1">
                    <h3 className="font-semibold text-ink">
                      <span className="mr-2 text-sm font-bold text-faint-nontext">
                        {index + 1}
                      </span>
                      {step.title}
                    </h3>
                    <p className="mt-1 text-sm text-body">{step.body}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </Card>

      {/* Two things that DO work with no history, so the page is not purely a
          list of things the student cannot do yet. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="flex flex-col p-5">
          <span className="grid h-10 w-10 place-items-center rounded-cg bg-hue-pair/10 text-hue-pair">
            <Users size={18} strokeWidth={2.2} aria-hidden />
          </span>
          <h3 className="mt-3 font-semibold text-ink">Pair with someone now</h3>
          <p className="mt-1 flex-1 text-sm text-body">
            Pairing needs no history at all. Pick a problem and work through it with
            a partner in a shared editor.
          </p>
          <Link
            href="/pair"
            className={buttonClass({ variant: 'secondary', size: 'sm', className: 'mt-4 self-start' })}
          >
            Start a session
          </Link>
        </Card>

        <Card className="flex flex-col p-5">
          <span className="grid h-10 w-10 place-items-center rounded-cg bg-hue-play/10 text-hue-play">
            <Gamepad2 size={18} strokeWidth={2.2} aria-hidden />
          </span>
          <h3 className="mt-3 font-semibold text-ink">Try a practice round</h3>
          <p className="mt-1 flex-1 text-sm text-body">
            Practice gets sharper once it knows your weak spots, but the games work
            from a standing start.
          </p>
          <Link
            href="/play"
            className={buttonClass({ variant: 'secondary', size: 'sm', className: 'mt-4 self-start' })}
          >
            Go to practice
          </Link>
        </Card>
      </div>
    </div>
  );
}
