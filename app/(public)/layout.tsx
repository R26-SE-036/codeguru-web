import { Gamepad2, Radar, Sparkles, Users } from 'lucide-react';

import { Brand } from '@/components/brand';
import { ThemeToggle } from '@/components/theme-toggle';
import { CountUp, Reveal } from '@/components/motion';
import { EditorDemo } from '@/components/editor-demo';

/**
 * The signed-out shell: a showcase panel beside the form.
 *
 * The showcase shows the product rather than describing it - the editor
 * catching an off-by-one is the first thing a student meets, so it is the
 * first thing this page shows - and then the four things the platform does
 * with that, each in the colour its section has inside the app.
 *
 * The panel is hidden below `lg` rather than stacked above the form. On a
 * phone the only thing anyone wants from this screen is the two fields, and a
 * full-height marketing panel pushed them below the fold.
 *
 * This layout persists across /login, /register and the recovery pages, so
 * the showcase animates once on arrival and stays still while the student
 * moves between forms.
 */

const HIGHLIGHTS = [
  {
    icon: Radar,
    title: 'Spots it',
    body: 'Logic errors underlined as you type.',
    tone: 'text-hue-insight',
    bg: 'bg-hue-insight/10',
  },
  {
    icon: Sparkles,
    title: 'Teaches it',
    body: 'A short lesson built around your own code.',
    tone: 'text-hue-study',
    bg: 'bg-hue-study/10',
  },
  {
    icon: Gamepad2,
    title: 'Practises it',
    body: 'Games that adapt to how you are doing.',
    tone: 'text-hue-play',
    bg: 'bg-hue-play/10',
  },
  {
    icon: Users,
    title: 'Pairs you up',
    body: 'Solve it with a partner in a shared editor.',
    tone: 'text-hue-pair',
    bg: 'bg-hue-pair/10',
  },
];

/**
 * Code Coach's own numbers: the size of its error catalogue, the hint levels
 * every finding carries, and the median end-to-end analysis time measured in
 * its latency evaluation. Update them here if any of those change.
 */
const FACTS = [
  { value: 19, decimals: 0, suffix: '', label: 'beginner error types' },
  { value: 3, decimals: 0, suffix: '', label: 'hint levels, never the answer' },
  { value: 3.9, decimals: 1, suffix: ' ms', label: 'median analysis time' },
];

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* ── Showcase ─────────────────────────────────────────────────────── */}
      {/* Pinned to the viewport and sized to it, so the form beside it is
          centred on the screen rather than on a panel taller than the screen. */}
      <section className="relative hidden overflow-hidden border-r border-line bg-card lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:gap-6 lg:px-10 lg:py-8 xl:px-12">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-32 -top-32 h-[30rem] w-[30rem] rounded-full bg-hue-study/20 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 -right-24 h-[30rem] w-[30rem] rounded-full bg-hue-insight/20 blur-3xl"
        />
        {/* The dot grid from the Overview hero, so signing in and arriving
            feel like the same place. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(rgb(var(--cg-rgb-border-strong))_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_40%_45%,black,transparent_72%)]"
        />

        <div className="relative">
          <Brand href={null} />
        </div>

        <div className="relative my-auto max-w-xl">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-card/70 px-3 py-1 text-xs font-semibold text-muted backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-ok" />
              Real-time help for Java beginners
            </span>
            <h2 className="mt-4 text-4xl font-extrabold leading-[1.1] tracking-tight text-ink [@media(min-height:900px)]:xl:text-5xl">
              Learn from the mistakes <span className="cg-gradient-text">you keep making</span>
            </h2>
            {/* Dropped on short screens first: the editor below says the same
                thing by showing it. */}
            <p className="mt-3 max-w-md text-body [@media(max-height:880px)]:hidden">
              Hints instead of answers, lessons built from your own code, and practice
              aimed at exactly what trips you up.
            </p>
          </Reveal>

          <Reveal delay={150} className="mt-5">
            <EditorDemo className="max-w-lg" />
          </Reveal>

          {/* The four components, as chips in their section colours. The
              one-line descriptions are each chip's tooltip and accessible name. */}
          <ul className="mt-5 flex max-w-xl flex-wrap gap-2">
            {HIGHLIGHTS.map((item, index) => {
              const Icon = item.icon;

              return (
                <Reveal
                  as="li"
                  key={item.title}
                  delay={350 + index * 70}
                  title={item.body}
                  className="inline-flex items-center gap-2 rounded-full border border-line bg-card/70 py-1.5 pl-1.5 pr-3.5 backdrop-blur"
                >
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${item.bg} ${item.tone}`}>
                    <Icon size={14} strokeWidth={2.3} aria-hidden />
                  </span>
                  <span className="text-[13px] font-semibold text-ink">{item.title}</span>
                  <span className="sr-only">: {item.body}</span>
                </Reveal>
              );
            })}
          </ul>
        </div>

        <Reveal delay={600} className="relative">
          <dl className="flex max-w-lg gap-8 border-t border-line pt-5">
            {FACTS.map((fact) => (
              <div key={fact.label}>
                <dt className="sr-only">{fact.label}</dt>
                <dd className="text-2xl font-extrabold tracking-tight text-ink">
                  <CountUp value={fact.value} decimals={fact.decimals} suffix={fact.suffix} />
                </dd>
                <dd className="text-xs text-muted">{fact.label}</dd>
              </div>
            ))}
          </dl>

        </Reveal>
      </section>

      {/* ── Form ─────────────────────────────────────────────────────────── */}
      <section className="relative flex flex-col overflow-hidden px-5 py-6 sm:px-8 sm:py-8">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-cg-wash" />

        <div className="relative flex items-center justify-between lg:justify-end">
          <Brand href={null} className="lg:hidden" />
          <ThemeToggle />
        </div>

        <div className="relative flex flex-1 items-center justify-center py-8">
          <div className="cg-card w-full max-w-md p-6 shadow-cg-lg animate-cg-rise sm:p-9">
            {children}
          </div>
        </div>

        <p className="relative text-center text-xs text-muted">
          A final-year research project in adaptive programming education.
        </p>
      </section>
    </div>
  );
}
