'use client';

import { Fragment, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Check as CheckIcon,
  CircleCheck,
  CircleX,
  Info,
  Lightbulb,
  ListOrdered,
  Sparkles,
  Terminal,
  TriangleAlert,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { useThemeColors } from '@/lib/theme';
import { Card } from '@/components/ui';

import type { Block, Program } from './course-types';

// Mermaid touches `document` on import; the lesson page loads it the same way.
const MermaidDiagram = dynamic(() => import('../[triggerId]/lesson/mermaid-diagram'), { ssr: false });

/**
 * One renderer per block type in a course unit.
 *
 * Every block arrives validated by Study Guider's schema, so a renderer can
 * trust its shape. An unknown type renders nothing rather than crashing the
 * unit - it would mean the page is older than the content.
 */
export function CourseBlock({ block }: { block: Block }) {
  switch (block.type) {
    case 'text':
      return <p className="leading-relaxed text-body">{inline(block.text)}</p>;
    case 'callout':
      return <Callout {...block} />;
    case 'code':
      return <ProgramPanel program={block} tone="neutral" />;
    case 'compare':
      return <Compare {...block} />;
    case 'table':
      return <TraceTable {...block} />;
    case 'diagram':
      return (
        <Figure caption={block.caption}>
          <MermaidDiagram chart={block.mermaid} svgLabels />
        </Figure>
      );
    case 'array':
      return <ArrayView {...block} />;
    case 'memory':
      return <MemoryView {...block} />;
    case 'chart':
      return <ChartView {...block} />;
    case 'steps':
      return <Steps {...block} />;
    case 'check':
      return <PracticeCheck {...block} />;
    case 'keypoints':
      return <KeyPoints items={block.items} />;
    default:
      return null;
  }
}

/** `code` spans inside prose. The only inline markup a unit uses. */
export function inline(text: string) {
  return text.split(/(`[^`]+`)/g).map((part, i) =>
    part.startsWith('`') && part.endsWith('`') ? (
      <code key={i} className="rounded bg-inset px-1.5 py-0.5 font-mono text-[0.9em] text-ink [font-variant-ligatures:none]">
        {part.slice(1, -1)}
      </code>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

function Figure({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <figure className="space-y-2">
      {children}
      <figcaption className="text-center text-sm text-muted">{caption}</figcaption>
    </figure>
  );
}

const CALLOUT = {
  info: { icon: Info, box: 'border-accent/30 bg-accent/[0.06]', text: 'text-accent' },
  tip: { icon: Lightbulb, box: 'border-ok/30 bg-ok/[0.06]', text: 'text-ok' },
  warn: { icon: TriangleAlert, box: 'border-warn/40 bg-warn/[0.08]', text: 'text-warn' },
} as const;

function Callout({ tone, title, text }: { tone: keyof typeof CALLOUT; title: string; text: string }) {
  const style = CALLOUT[tone];
  const Icon = style.icon;
  return (
    <aside className={`flex gap-3 rounded-cg-lg border p-4 ${style.box}`}>
      <Icon size={18} strokeWidth={2.2} aria-hidden className={`mt-0.5 shrink-0 ${style.text}`} />
      <div>
        <p className={`font-semibold ${style.text}`}>{title}</p>
        <p className="mt-1 leading-relaxed text-body">{inline(text)}</p>
      </div>
    </aside>
  );
}

/* ── Code ───────────────────────────────────────────────────────────────── */

const TONE = {
  bad: { label: "Don't do this", icon: X, head: 'text-danger', body: 'bg-danger/[0.05]', rule: 'border-danger/15' },
  good: { label: 'Do this instead', icon: CheckIcon, head: 'text-ok', body: 'bg-ok/[0.05]', rule: 'border-ok/15' },
  neutral: { label: 'Example', icon: Terminal, head: 'text-ink', body: 'bg-inset/60', rule: 'border-line' },
} as const;

function ProgramPanel({ program, tone }: { program: Program; tone: keyof typeof TONE }) {
  const style = TONE[tone];
  const Icon = style.icon;
  return (
    <section className={`flex h-full flex-col overflow-hidden rounded-cg-lg border border-line ${style.body}`}>
      <header className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold ${style.head}`}>
        <Icon size={14} strokeWidth={2.6} aria-hidden />
        {tone === 'neutral' ? program.title || style.label : style.label}
        {tone !== 'neutral' && program.title && (
          <span className="ml-auto text-xs font-normal text-muted">{program.title}</span>
        )}
      </header>
      <pre className={`flex-1 overflow-x-auto border-t px-4 py-3.5 font-mono text-[13px] leading-relaxed text-ink [font-variant-ligatures:none] ${style.rule}`}>
        {program.code}
      </pre>
      {program.runnable && (program.output || program.error) && <Console program={program} />}
    </section>
  );
}

/**
 * What the program prints. Only shown for runnable examples, which Study
 * Guider compiles and runs before a unit is published - so the badge is a
 * claim the tests back, not decoration.
 */
function Console({ program }: { program: Program }) {
  return (
    <div className="border-t border-line bg-[#0f1420] px-4 py-3 font-mono text-[12.5px] leading-relaxed [font-variant-ligatures:none]">
      <p className="mb-1.5 flex items-center gap-1.5 font-sans text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        <Terminal size={12} strokeWidth={2.4} aria-hidden />
        Output
        <span className="ml-auto normal-case tracking-normal text-slate-500">compiled and run</span>
      </p>
      {program.output && <pre className="whitespace-pre-wrap text-slate-100">{program.output}</pre>}
      {program.error && <p className="mt-1 text-red-400">Crashes: {program.error}</p>}
    </div>
  );
}

function Compare({ bad, good, note }: { bad: Program; good: Program; note: string }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <ProgramPanel program={bad} tone="bad" />
        <ProgramPanel program={good} tone="good" />
      </div>
      {note && <p className="text-sm leading-relaxed text-body">{inline(note)}</p>}
    </div>
  );
}

/* ── Tables and pictures ────────────────────────────────────────────────── */

function TraceTable({
  caption,
  columns,
  rows,
  highlight,
}: {
  caption: string;
  columns: string[];
  rows: string[][];
  highlight: number[];
}) {
  return (
    <Figure caption={caption}>
      <div className="overflow-x-auto rounded-cg-lg border border-line">
        <table className="w-full text-left text-sm">
          <thead className="bg-card-alt text-xs text-muted">
            <tr>
              {columns.map((column) => (
                <th key={column} scope="col" className="px-4 py-2.5 font-semibold">
                  {inline(column)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr
                key={r}
                className={`border-t border-line ${highlight.includes(r) ? 'bg-warn/10 font-semibold text-ink' : 'text-body'}`}
              >
                {row.map((cell, c) => (
                  <td key={c} className="px-4 py-2.5">
                    {inline(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Figure>
  );
}

/** An array as numbered boxes, with the box that is not there drawn dashed. */
function ArrayView({
  caption,
  name,
  values,
  highlight,
  outside,
  note,
}: {
  caption: string;
  name: string;
  values: string[];
  highlight: number[];
  outside: number | null;
  note: string;
}) {
  const cells = values.map((value, index) => ({ value, index, missing: false }));
  if (outside !== null && outside >= values.length) cells.push({ value: '?', index: outside, missing: true });

  return (
    <Figure caption={caption}>
      <div className="rounded-cg-lg border border-line bg-card-alt px-4 py-6">
        {/* w-max inside the scroller: a centred row wider than a phone would
            otherwise be clipped on the left, where it cannot be scrolled to. */}
        <div className="overflow-x-auto">
          <div className="mx-auto flex w-max items-start gap-3 sm:gap-4">
            <span className="mt-4 shrink-0 font-mono text-sm font-semibold text-muted">{name}</span>
            {cells.map((cell) => (
              <div key={cell.index} className="flex flex-col items-center gap-1.5">
                <div
                  className={`grid h-12 w-12 place-items-center rounded-cg border-2 font-mono text-base font-bold sm:h-14 sm:w-16 sm:text-lg ${
                    cell.missing
                      ? 'border-dashed border-danger/70 bg-danger/[0.06] text-danger'
                      : highlight.includes(cell.index)
                        ? 'border-hue-study bg-hue-study/10 text-ink'
                        : 'border-line-strong bg-card text-ink'
                  }`}
                >
                  {cell.value}
                </div>
                <span className={`font-mono text-xs ${cell.missing ? 'font-semibold text-danger' : 'text-muted'}`}>
                  [{cell.index}]
                </span>
              </div>
            ))}
          </div>
        </div>
        {note && <p className="mx-auto mt-4 max-w-lg text-center text-sm text-body">{inline(note)}</p>}
      </div>
    </Figure>
  );
}

/** Variables on the left, the objects they refer to on the right, joined by arrows. */
function MemoryView({
  caption,
  variables,
  objects,
  note,
}: {
  caption: string;
  variables: { name: string; target: string }[];
  objects: { id: string; text: string }[];
  note: string;
}) {
  const ROW = 70;
  const height = Math.max(variables.length, objects.length) * ROW + 30;
  const rowOf = (index: number, count: number) => 15 + (height - 30 - count * ROW) / 2 + index * ROW + ROW / 2;
  const objectRow = new Map(objects.map((o, i) => [o.id, rowOf(i, objects.length)]));
  const ink = 'rgb(var(--cg-rgb-ink))';
  const study = 'rgb(var(--cg-rgb-hue-study))';

  return (
    <Figure caption={caption}>
      <div className="rounded-cg-lg border border-line bg-card-alt p-4">
        <svg viewBox={`0 0 560 ${height}`} className="mx-auto h-auto w-full max-w-xl" role="img" aria-label={caption}>
          <defs>
            <marker id="course-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" style={{ fill: study }} />
            </marker>
          </defs>
          <text x="95" y="12" textAnchor="middle" style={{ fill: 'rgb(var(--cg-rgb-muted))', fontSize: 11, fontWeight: 600 }}>
            VARIABLES
          </text>
          <text x="455" y="12" textAnchor="middle" style={{ fill: 'rgb(var(--cg-rgb-muted))', fontSize: 11, fontWeight: 600 }}>
            OBJECTS IN MEMORY
          </text>
          {variables.map((variable, i) => {
            const y = rowOf(i, variables.length);
            const to = objectRow.get(variable.target) ?? y;
            return (
              <g key={variable.name}>
                <rect x="10" y={y - 22} width="170" height="44" rx="8"
                  style={{ fill: 'rgb(var(--cg-rgb-card))', stroke: 'rgb(var(--cg-rgb-border-strong))', strokeWidth: 1.5 }} />
                <text x="95" y={y + 5} textAnchor="middle" style={{ fill: ink, fontSize: 14, fontFamily: 'var(--cg-font-mono, monospace)' }}>
                  {variable.name}
                </text>
                <line x1="182" y1={y} x2="358" y2={to} markerEnd="url(#course-arrow)" style={{ stroke: study, strokeWidth: 2.2 }} />
              </g>
            );
          })}
          {objects.map((object, i) => {
            const y = rowOf(i, objects.length);
            return (
              <g key={object.id}>
                <rect x="360" y={y - 24} width="190" height="48" rx="14"
                  style={{ fill: 'rgb(var(--cg-rgb-hue-study) / 0.1)', stroke: study, strokeWidth: 1.8 }} />
                <text x="455" y={y + 5} textAnchor="middle" style={{ fill: ink, fontSize: 15, fontWeight: 700, fontFamily: 'var(--cg-font-mono, monospace)' }}>
                  {object.text}
                </text>
              </g>
            );
          })}
        </svg>
        {note && <p className="mx-auto mt-3 max-w-lg text-center text-sm text-body">{inline(note)}</p>}
      </div>
    </Figure>
  );
}

const CHART_TOKENS = {
  accent: '--cg-accent',
  warn: '--cg-warn',
  ok: '--cg-ok',
  grid: '--cg-border',
  axis: '--cg-muted',
  card: '--cg-card',
  ink: '--cg-ink',
} as const;

function ChartView({
  caption,
  x_label,
  y_label,
  categories,
  series,
}: {
  caption: string;
  x_label: string;
  y_label: string;
  categories: string[];
  series: { name: string; values: number[] }[];
}) {
  const colors = useThemeColors(CHART_TOKENS);
  const palette = [colors.accent, colors.warn, colors.ok];
  const data = categories.map((category, i) => ({
    category,
    ...Object.fromEntries(series.map((s) => [s.name, s.values[i]])),
  }));

  return (
    <Figure caption={caption}>
      <div className="h-72 rounded-cg-lg border border-line bg-card p-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 12, right: 12, bottom: 18, left: 12 }}>
            <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="category"
              tick={{ fill: colors.axis, fontSize: 12 }}
              stroke={colors.grid}
              label={{ value: x_label, position: 'insideBottom', offset: -10, fill: colors.axis, fontSize: 12 }}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: colors.axis, fontSize: 12 }}
              stroke={colors.grid}
              label={{ value: y_label, angle: -90, position: 'insideLeft', offset: 4, fill: colors.axis, fontSize: 12, style: { textAnchor: 'middle' } }}
            />
            <Tooltip
              cursor={{ fill: colors.grid, opacity: 0.4 }}
              contentStyle={{ background: colors.card, border: `1px solid ${colors.grid}`, borderRadius: 12, color: colors.ink, fontSize: 12 }}
            />
            {series.length > 1 && <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 12 }} />}
            {series.map((s, i) => (
              <Bar key={s.name} dataKey={s.name} fill={palette[i]} radius={[6, 6, 0, 0]} maxBarSize={56} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Figure>
  );
}

/* ── Lists and practice ─────────────────────────────────────────────────── */

function Steps({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-cg-lg border border-line bg-card-alt p-5">
      {title && (
        <p className="flex items-center gap-2 font-semibold text-ink">
          <ListOrdered size={17} strokeWidth={2.2} aria-hidden className="text-hue-study" />
          {title}
        </p>
      )}
      <ol className="mt-3 space-y-2.5">
        {items.map((item, i) => (
          <li key={i} className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-hue-study text-xs font-bold text-white">
              {i + 1}
            </span>
            <span className="leading-relaxed text-body">{inline(item)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function KeyPoints({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-2.5 sm:grid-cols-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5 rounded-cg-lg border border-line bg-card p-3.5">
          <Sparkles size={16} strokeWidth={2.2} aria-hidden className="mt-0.5 shrink-0 text-hue-study" />
          <span className="text-sm leading-relaxed text-body">{inline(item)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * A practice question. Checked here, in the browser, and never sent anywhere:
 * the course does not feed knowledge tracing. A student can try again as often
 * as they like.
 */
function PracticeCheck({
  question,
  code,
  options,
  answer,
  explanation,
}: {
  question: string;
  code: string;
  options: string[];
  answer: number;
  explanation: string;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const right = picked === answer;

  return (
    <Card className="p-5">
      <p className="font-semibold text-ink">{inline(question)}</p>
      {code && (
        <pre className="mt-3 overflow-x-auto rounded-cg border border-line bg-inset/60 px-4 py-3 font-mono text-[13px] leading-relaxed text-ink [font-variant-ligatures:none]">
          {code}
        </pre>
      )}
      <div className="mt-4 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={question}>
        {options.map((option, i) => {
          const chosen = picked === i;
          const showRight = picked !== null && i === answer;
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={chosen}
              onClick={() => setPicked(i)}
              className={`cg-focusable flex items-center gap-2.5 rounded-cg border-2 px-3.5 py-2.5 text-left text-sm transition ${
                showRight
                  ? 'border-ok bg-ok/10 text-ink'
                  : chosen
                    ? 'border-danger bg-danger/10 text-ink'
                    : 'border-line bg-card text-body hover:border-hue-study/50'
              }`}
            >
              {showRight ? (
                <CircleCheck size={16} strokeWidth={2.4} aria-hidden className="shrink-0 text-ok" />
              ) : chosen ? (
                <CircleX size={16} strokeWidth={2.4} aria-hidden className="shrink-0 text-danger" />
              ) : (
                <span aria-hidden className="h-4 w-4 shrink-0 rounded-full border-2 border-line-strong" />
              )}
              <span className={/[=(<>"]/.test(option) ? 'font-mono text-[13px] [font-variant-ligatures:none]' : ''}>{option}</span>
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <p role="status" className={`mt-4 rounded-cg px-4 py-3 text-sm leading-relaxed ${right ? 'bg-ok/10' : 'bg-warn/10'}`}>
          <span className={`font-semibold ${right ? 'text-ok' : 'text-warn'}`}>{right ? 'Right. ' : 'Not quite. '}</span>
          <span className="text-body">{inline(explanation)}</span>
        </p>
      )}
    </Card>
  );
}
