'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Circle,
  Clock3,
  GraduationCap,
  ListChecks,
  Target,
} from 'lucide-react';

import {
  COURSE_PROGRESS_EVENT,
  finishedUnits,
  markSectionsRead,
  sectionsRead,
  setFinished,
} from '@/lib/course-progress';
import { Badge, Card, buttonClass } from '@/components/ui';

import { CourseBlock, inline } from '../blocks';
import type { UnitPage } from '../course-types';
import { ReadingBar, Syllabus } from './syllabus';

/**
 * One course unit, laid out like a course page: the syllabus of this unit on
 * the left, the sections on the right, and a "finished" mark at the end.
 *
 * Nothing here reports to Study Guider. The practice questions are checked in
 * the browser and "finished" is kept in this browser only, because reading a
 * general unit is not the kind of evidence knowledge tracing is built on.
 */
export function UnitView({ page }: { page: UnitPage }) {
  const { unit, module, previous, next } = page;
  const [active, setActive] = useState(0);
  // Sections read through, as a high-water mark: everything above the one on
  // screen counts as read, and reaching the end of the unit counts them all.
  const [read, setRead] = useState(0);
  const [scrolled, setScrolled] = useState(0);
  const [finished, setFinishedState] = useState(false);
  const articleRef = useRef<HTMLElement>(null);
  const endRef = useRef<HTMLElement>(null);
  const total = unit.sections.length;

  useEffect(() => setRead(sectionsRead(unit.id)), [unit.id]);

  const reach = (count: number) => {
    setRead((current) => {
      const next = Math.max(current, Math.min(count, total));
      if (next > current) markSectionsRead(unit.id, next);
      return next;
    });
  };

  useEffect(() => {
    const read = () => setFinishedState(finishedUnits().has(unit.id));
    read();
    window.addEventListener(COURSE_PROGRESS_EVENT, read);
    return () => window.removeEventListener(COURSE_PROGRESS_EVENT, read);
  }, [unit.id]);

  // The section on screen, and everything above it counted as read.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (!visible[0]) return;
        const index = unit.sections.findIndex((s) => s.id === visible[0].target.id);
        if (index >= 0) {
          setActive(index);
          reach(index);
        }
      },
      { rootMargin: '-15% 0px -70% 0px' },
    );
    unit.sections.forEach((section) => {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    });
    // The end of the unit in view: the last section has been read too.
    const end = new IntersectionObserver((entries) => {
      // The last section can rarely scroll high enough to become the one on
      // screen, so reaching the end makes it current.
      if (entries.some((e) => e.isIntersecting)) {
        reach(total);
        setActive(total - 1);
      }
    });
    if (endRef.current) end.observe(endRef.current);
    return () => {
      observer.disconnect();
      end.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit.sections, unit.id]);

  // How far through the article the window is, for the bar along the top.
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const article = articleRef.current;
        if (!article) return;
        const box = article.getBoundingClientRect();
        const span = box.height - window.innerHeight;
        setScrolled(span <= 0 ? 100 : Math.min(100, Math.max(0, (-box.top / span) * 100)));
      });
    };
    measure();
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, []);

  const checks = unit.sections.reduce((n, s) => n + s.blocks.filter((b) => b.type === 'check').length, 0);

  return (
    <div className="mx-auto grid gap-10 xl:grid-cols-[19rem_minmax(0,1fr)]">
      <ReadingBar percent={scrolled} />
      <aside className="space-y-5 xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:self-start xl:overflow-y-auto">
        <Link
          href="/study/course"
          className="cg-focusable inline-flex items-center gap-1.5 rounded text-sm font-semibold text-muted transition hover:text-ink"
        >
          <ArrowLeft size={15} strokeWidth={2.4} aria-hidden />
          Java foundations
        </Link>
        <div className="hidden xl:block">
          <Syllabus
            sections={unit.sections}
            active={active}
            read={read}
            finished={finished}
            onFinish={() => setFinished(unit.id, true)}
          />
        </div>
      </aside>

      <article ref={articleRef} className="min-w-0 space-y-10 text-[1.0625rem] leading-relaxed lg:text-lg">
        <header className="relative overflow-hidden rounded-cg-xl border border-line bg-card p-6 shadow-cg-sm sm:p-8">
          <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-hue-study/20 blur-3xl" />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="accent">
                <BookOpen size={13} strokeWidth={2.4} aria-hidden />
                Module {module.number} · {module.title}
              </Badge>
              {finished && (
                <Badge tone="ok">
                  <CheckCircle2 size={13} strokeWidth={2.4} aria-hidden />
                  Finished
                </Badge>
              )}
            </div>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-ink sm:text-[2.6rem] sm:leading-tight">{unit.title}</h1>
            <p className="mt-3 max-w-3xl text-lg text-body lg:text-xl">{unit.summary}</p>
            <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted lg:text-base">
              <li className="flex items-center gap-1.5"><Clock3 size={15} aria-hidden /> about {unit.minutes} min</li>
              <li className="flex items-center gap-1.5"><GraduationCap size={15} aria-hidden /> {unit.sections.length} sections</li>
              <li className="flex items-center gap-1.5"><ListChecks size={15} aria-hidden /> {checks} practice questions</li>
            </ul>
          </div>
        </header>

        <Card className="p-6">
          <h2 className="flex items-center gap-2 font-bold text-ink">
            <Target size={17} strokeWidth={2.2} aria-hidden className="text-hue-study" />
            What you will be able to do
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {unit.objectives.map((objective) => (
              <li key={objective} className="flex gap-2 text-base leading-relaxed text-body">
                <CheckCircle2 size={16} strokeWidth={2.2} aria-hidden className="mt-0.5 shrink-0 text-ok" />
                <span>{inline(objective)}</span>
              </li>
            ))}
          </ul>
        </Card>

        {unit.sections.map((section, i) => (
          <section key={section.id} id={section.id} className="scroll-mt-6 space-y-6">
            <h2 className="flex items-baseline gap-3 text-2xl font-bold tracking-tight text-ink lg:text-[1.9rem]">
              <span
                className={`grid h-9 w-9 shrink-0 place-items-center self-center rounded-cg text-sm font-bold transition-colors duration-500 ${
                  i < read ? 'bg-ok/15 text-ok' : 'bg-hue-study/10 text-hue-study'
                }`}
              >
                {i + 1}
              </span>
              {section.title}
            </h2>
            {section.blocks.map((block, b) => (
              <CourseBlock key={b} block={block} />
            ))}
          </section>
        ))}

        <footer ref={endRef} className="space-y-5 border-t border-line pt-8">
          <Card className="flex flex-wrap items-center gap-4 p-5">
            <button
              type="button"
              onClick={() => setFinished(unit.id, !finished)}
              className={buttonClass({ variant: finished ? 'secondary' : 'primary' })}
              aria-pressed={finished}
            >
              {finished ? <CheckCircle2 size={16} strokeWidth={2.4} aria-hidden /> : <Circle size={16} strokeWidth={2.4} aria-hidden />}
              {finished ? 'Finished' : 'Mark as finished'}
            </button>
            <p className="min-w-0 flex-1 text-sm text-muted">
              The course is free reading. Finishing a unit and its practice questions does not change your
              mastery or progress; those come from the quizzes on your own mistakes.
            </p>
          </Card>

          <nav aria-label="Units" className="grid gap-3 sm:grid-cols-2">
            {previous ? (
              <Link href={`/study/course/${previous.id}`} className="cg-focusable rounded-cg-lg border border-line bg-card p-4 transition hover:border-hue-study/50">
                <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
                  <ArrowLeft size={13} aria-hidden /> Previous
                </span>
                <span className="mt-1 block font-semibold text-ink">{previous.title}</span>
              </Link>
            ) : <span />}
            {next && (
              <Link href={`/study/course/${next.id}`} className="cg-focusable rounded-cg-lg border border-line bg-card p-4 text-right transition hover:border-hue-study/50">
                <span className="flex items-center justify-end gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
                  Next <ArrowRight size={13} aria-hidden />
                </span>
                <span className="mt-1 block font-semibold text-ink">{next.title}</span>
              </Link>
            )}
          </nav>
        </footer>
      </article>
    </div>
  );
}
