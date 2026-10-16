'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Clock3, GraduationCap, Layers, Lock } from 'lucide-react';

import { COURSE_PROGRESS_EVENT, finishedUnits } from '@/lib/course-progress';
import { Card, Unavailable, buttonClass } from '@/components/ui';
import { Reveal } from '@/components/motion';

import type { Catalogue, CatalogueUnit } from './course-types';

/**
 * The Java foundations course: every mistake Code Coach looks for, as a
 * written unit, in teaching order.
 *
 * Open to every signed-in student, Free or Pro, and independent of the
 * lessons above it on /study: those wait for a remediation trigger from Code
 * Coach, these do not. "Finished" lives in this browser only (see
 * lib/course-progress.ts) and never touches mastery.
 */
export function CourseHome({ catalogue }: { catalogue: Catalogue | null }) {
  const [finished, setFinished] = useState<Set<string>>(new Set());

  useEffect(() => {
    const read = () => setFinished(finishedUnits());
    read();
    window.addEventListener(COURSE_PROGRESS_EVENT, read);
    return () => window.removeEventListener(COURSE_PROGRESS_EVENT, read);
  }, []);

  if (!catalogue) {
    return (
      <div className="space-y-6">
        <BackLink />
        <Unavailable what="The course" />
      </div>
    );
  }

  const available = catalogue.modules.flatMap((m) => m.units).filter((u) => u.available);
  const done = available.filter((u) => finished.has(u.id)).length;
  const nextUp = available.find((u) => !finished.has(u.id)) ?? available[0];

  return (
    <div className="space-y-10">
      <BackLink />

      <Reveal as="section" className="relative overflow-hidden rounded-cg-xl border border-line bg-card p-6 shadow-cg-sm sm:p-9">
        <div aria-hidden className="pointer-events-none absolute -left-24 -top-28 h-72 w-72 rounded-full bg-hue-study/25 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -right-16 h-72 w-72 rounded-full bg-hue-insight/15 blur-3xl" />
        <div className="relative max-w-2xl">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-hue-study">
            <GraduationCap size={14} strokeWidth={2.4} aria-hidden />
            Free course
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink sm:text-[2.4rem] sm:leading-tight">
            Java <span className="cg-gradient-text">foundations</span>
          </h1>
          <p className="mt-3 text-body">
            Every mistake Code Coach watches for, explained properly: why it happens, pictures and traces of
            what the computer does, worked examples, the same bug in disguise, and practice questions. Read it
            any time, whether or not you have made the mistake yet.
          </p>
          <ul className="mt-5 flex flex-wrap gap-2 text-sm text-body">
            <Chip icon={Layers}><b className="text-ink">{catalogue.modules.length}</b> modules</Chip>
            <Chip icon={BookOpen}><b className="text-ink">{catalogue.units_available}</b> of {catalogue.units_total} units ready</Chip>
            <Chip icon={CheckCircle2}><b className="text-ink">{done}</b> finished</Chip>
          </ul>
          {nextUp && (
            <Link href={`/study/course/${nextUp.id}`} className={buttonClass({ size: 'lg', className: 'mt-6' })}>
              {done > 0 ? 'Continue' : 'Start'}: {nextUp.title}
              <ArrowRight size={16} strokeWidth={2.4} aria-hidden />
            </Link>
          )}
        </div>
      </Reveal>

      <section className="space-y-4">
        {catalogue.modules.map((module, index) => {
          const ready = module.units.some((u) => u.available);
          return (
            <Reveal key={module.concept} delay={(index % 4) * 40}>
              <Card className={`p-5 sm:p-6 ${ready ? '' : 'opacity-80'}`}>
                <div className="flex gap-4">
                  <span
                    className={`grid h-11 w-11 shrink-0 place-items-center rounded-cg-lg text-base font-bold ${
                      ready ? 'bg-hue-study text-white' : 'bg-card-alt text-muted'
                    }`}
                  >
                    {module.number}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-bold text-ink">{module.title}</h2>
                    <p className="mt-0.5 text-sm text-muted">{inlineCode(module.blurb)}</p>
                    <ul className="mt-3 space-y-2">
                      {module.units.map((unit) => (
                        <li key={unit.id}>
                          <UnitRow unit={unit} finished={finished.has(unit.id)} />
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </Card>
            </Reveal>
          );
        })}
      </section>

      <p className="text-center text-sm text-muted">
        The course does not change your mastery or progress. Those come from the quizzes on your own mistakes.
      </p>
    </div>
  );
}

function UnitRow({ unit, finished }: { unit: CatalogueUnit; finished: boolean }) {
  if (!unit.available) {
    return (
      <div className="flex items-center gap-3 rounded-cg border border-dashed border-line px-4 py-3 text-sm text-muted">
        <Lock size={15} strokeWidth={2.2} aria-hidden className="shrink-0" />
        <span className="flex-1">{unit.title}</span>
        <span className="text-xs">Being written</span>
      </div>
    );
  }
  return (
    <Link
      href={`/study/course/${unit.id}`}
      className="cg-focusable group flex items-center gap-3 rounded-cg border border-line bg-card-alt px-4 py-3 transition hover:border-hue-study/50 hover:bg-hue-study/[0.05]"
    >
      {finished ? (
        <CheckCircle2 size={18} strokeWidth={2.4} aria-label="Finished" className="shrink-0 text-ok" />
      ) : (
        <BookOpen size={18} strokeWidth={2.2} aria-hidden className="shrink-0 text-hue-study" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-ink">{unit.title}</span>
        <span className="block truncate text-sm text-muted">{unit.summary}</span>
      </span>
      {unit.minutes && (
        <span className="hidden shrink-0 items-center gap-1 text-xs text-muted sm:flex">
          <Clock3 size={13} aria-hidden /> {unit.minutes} min
        </span>
      )}
      <ArrowRight size={16} aria-hidden className="shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-ink" />
    </Link>
  );
}

function Chip({ icon: Icon, children }: { icon: typeof BookOpen; children: React.ReactNode }) {
  return (
    <li className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card/70 px-3 py-1.5 backdrop-blur">
      <Icon size={15} strokeWidth={2.3} aria-hidden className="text-hue-study" />
      <span>{children}</span>
    </li>
  );
}

function BackLink() {
  return (
    <Link href="/study" className="cg-focusable inline-flex items-center gap-1.5 rounded text-sm font-semibold text-muted transition hover:text-ink">
      <ArrowLeft size={15} strokeWidth={2.4} aria-hidden />
      Study
    </Link>
  );
}

function inlineCode(text: string) {
  return text.split(/(`[^`]+`)/g).map((part, i) =>
    part.startsWith('`') && part.endsWith('`') ? (
      <code key={i} className="rounded bg-inset px-1 font-mono text-[0.92em] text-ink">{part.slice(1, -1)}</code>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}
