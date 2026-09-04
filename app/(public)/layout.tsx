import { Gamepad2, Radar, Sparkles, Users } from 'lucide-react';

import { Brand } from '@/components/brand';
import { ThemeToggle } from '@/components/theme-toggle';

/**
 * The signed-out shell: a showcase panel beside the form.
 *
 * The panel is hidden below `lg` rather than stacked above the form. On a
 * phone the only thing anyone wants from this screen is the two fields, and a
 * full-height marketing panel pushed them below the fold.
 */

const HIGHLIGHTS = [
  {
    icon: Radar,
    title: 'It watches the code you actually write',
    body: 'Logic mistakes get underlined as you type — off-by-one loops, conditions that assign instead of compare.',
  },
  {
    icon: Sparkles,
    title: 'Lessons for your mistake, not the topic',
    body: 'Repeat something and you get a short lesson written around the exact code you wrote.',
  },
  {
    icon: Gamepad2,
    title: 'Practice that meets you where you are',
    body: 'Short games that get harder as you get better, and easier when you are stuck.',
  },
  {
    icon: Users,
    title: 'Pair up when you are stuck',
    body: 'Drive or navigate through a problem with someone else, in a shared editor.',
  },
];

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* ── Showcase ─────────────────────────────────────────────────────── */}
      <section className="relative hidden overflow-hidden bg-card lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-32 -top-32 h-[30rem] w-[30rem] rounded-full bg-hue-study/20 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 -right-24 h-[30rem] w-[30rem] rounded-full bg-hue-insight/20 blur-3xl"
        />

        <div className="relative">
          <Brand href={null} />
        </div>

        <div className="relative max-w-lg">
          <h2 className="text-4xl font-extrabold leading-tight tracking-tight text-ink">
            Learn from the mistakes{' '}
            <span className="cg-gradient-text">you keep making</span>
          </h2>

          <ul className="mt-9 space-y-6">
            {HIGHLIGHTS.map((item) => {
              const Icon = item.icon;

              return (
                <li key={item.title} className="flex gap-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-cg bg-accent/10 text-accent">
                    <Icon size={18} strokeWidth={2.2} aria-hidden />
                  </span>
                  <div>
                    <h3 className="font-semibold text-ink">{item.title}</h3>
                    <p className="mt-1 text-sm text-body">{item.body}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <p className="relative text-xs text-muted">
          A final-year research project in adaptive programming education.
        </p>
      </section>

      {/* ── Form ─────────────────────────────────────────────────────────── */}
      <section className="relative flex flex-col px-5 py-8 sm:px-8">
        <div className="flex items-center justify-between lg:justify-end">
          <Brand href={null} className="lg:hidden" />
          <ThemeToggle />
        </div>

        <div className="flex flex-1 items-center justify-center py-8">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </section>
    </div>
  );
}
