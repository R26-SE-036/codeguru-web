'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { parseFlowchart, rolesFor, stripFences, type FlowRole } from '@/lib/flowchart';
import { THEME_CHANGE_EVENT } from '@/lib/theme-preference';

/**
 * A Mermaid diagram, rendered client-side.
 *
 * Two things this has to get right, both learned the hard way in the original
 * codebase:
 *
 * 1. Mermaid renders its OWN svg, so CSS custom properties do not reach it.
 *    `stroke="var(--cg-accent)"` on a generated node renders with no colour at
 *    all - an SVG presentation attribute is not a CSS declaration. The theme
 *    has to be handed over as resolved values, which is what readToken does.
 *
 * 2. It touches `document` at import time, so it cannot be imported on the
 *    server. The parent loads this file with `dynamic(..., { ssr: false })`.
 */
/**
 * Make a generated diagram parseable.
 *
 * The diagram is written by a language model, and a model writing prose into a
 * node label produces this constantly:
 *
 *     graph TD
 *       A[Start Switch (e.g., dayOfWeek = 3)] --> B[...]
 *
 * Unquoted parentheses inside a square-bracket label are a syntax error -
 * Mermaid reports `Expecting 'SQE' ... got 'PS'` and renders nothing, so the
 * student loses the whole diagram over a pair of brackets. Quoting the label
 * makes any punctuation literal, which is what Mermaid's own docs recommend
 * for exactly this.
 *
 * Applied to `[...]` and `{...}` labels only. Round `(...)` nodes are left
 * alone deliberately: telling a node's closing paren from a paren inside its
 * text needs balanced-delimiter matching, and a regex that gets that wrong
 * would corrupt diagrams that currently parse.
 */
export function quoteNodeLabels(chart: string): string {
  // Anything outside this set is safer quoted. Quoting a label that did not
  // need it changes nothing about how it renders.
  const safe = /^[\w\s.,'\-/=<>+*!?%&:;]+$/;

  const quote = (label: string) =>
    // Mermaid has no backslash escape inside a quoted label; `#quot;` is its
    // entity syntax and the only way to get a literal double quote through.
    `"${label.trim().replace(/"/g, '#quot;')}"`;

  return (
    // A fenced block occasionally survives the model's JSON, and mermaid
    // will not parse the fence.
    stripFences(chart)
      // `id[label]` and `id{label}`. The identifier prefix is what keeps this
      // off edge labels (|like this|), which have no id before them.
      .replace(/([A-Za-z0-9_]+)\[([^\[\]"]+)\]/g, (match, id, label) =>
        safe.test(label) ? match : `${id}[${quote(label)}]`,
      )
      .replace(/([A-Za-z0-9_]+)\{([^{}"]+)\}/g, (match, id, label) =>
        safe.test(label) ? match : `${id}{${quote(label)}}`,
      )
  );
}

/**
 * A `--cg-rgb-*` triplet ("79 70 229") as #rrggbb.
 *
 * Mermaid's colour parser does not read the space-separated `rgb(79 70 229)`
 * form. Handing it that made every themeVariable invalid, and Mermaid quietly
 * fell back to its own lilac-and-purple default - which is what students saw.
 */
function readHex(name: string, fallback: string): string {
  const parts = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
    .split(/\s+/)
    .map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return fallback;
  return `#${parts.map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')}`;
}

/** Fill, border and text per role - the same story colours as the step flow. */
function roleClassDefs(): Record<FlowRole, string> {
  const ink = readHex('--cg-rgb-ink', '#0b1220');
  const style = (fill: string, stroke: string) =>
    `fill:${fill},stroke:${stroke},stroke-width:2px,color:${ink}`;
  const accent = readHex('--cg-rgb-accent', '#4f46e5');
  const accentSoft = readHex('--cg-rgb-accent-soft', '#eef0ff');
  return {
    start: style(accentSoft, accent),
    end: style(accentSoft, accent),
    step: style(readHex('--cg-rgb-card', '#ffffff'), readHex('--cg-rgb-hue-study', '#8b5cf6')),
    decision: style(readHex('--cg-rgb-warn-soft', '#fef3c7'), readHex('--cg-rgb-warn', '#b45309')),
    problem: style(readHex('--cg-rgb-danger-soft', '#fee2e2'), readHex('--cg-rgb-danger', '#be2020')),
    fix: style(readHex('--cg-rgb-ok-soft', '#dcfce7'), readHex('--cg-rgb-ok', '#15803d')),
  };
}

/** The chart with each node classed by role, when it can be read. */
function withRoleClasses(chart: string): string {
  const graph = parseFlowchart(chart);
  if (!graph) return chart;

  const defs = roleClassDefs();
  const byRole = new Map<FlowRole, string[]>();
  for (const [id, role] of rolesFor(graph)) {
    byRole.set(role, [...(byRole.get(role) ?? []), id]);
  }

  // Heavier arrows: the default hairline all but vanished at lesson size.
  const lines = [chart, 'linkStyle default stroke-width:2px'];
  for (const [role, ids] of byRole) {
    lines.push(`classDef cg${role} ${defs[role]}`, `class ${ids.join(',')} cg${role}`);
  }
  return lines.join('\n');
}

export default function MermaidDiagram({ chart }: { chart: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  // Bumped when the student switches theme, so the colours are read again.
  const [themeRevision, setThemeRevision] = useState(0);
  // Mermaid needs a DOM id unique per diagram; useId gives a stable one that
  // matches between renders.
  const id = useId().replace(/:/g, '');

  useEffect(() => {
    const refresh = () => setThemeRevision((n) => n + 1);
    window.addEventListener(THEME_CHANGE_EVENT, refresh);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, refresh);
  }, []);

  useEffect(() => {
    let live = true;

    (async () => {
      try {
        const mermaid = (await import('mermaid')).default;

        const accent = readHex('--cg-rgb-accent', '#4f46e5');
        const card = readHex('--cg-rgb-card', '#ffffff');
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'base',
          themeVariables: {
            background: card,
            primaryColor: readHex('--cg-rgb-accent-soft', '#eef0ff'),
            primaryBorderColor: accent,
            primaryTextColor: readHex('--cg-rgb-ink', '#0b1220'),
            // The arrows carry the flow, so they get the accent rather than a
            // border grey that disappeared against the card.
            lineColor: accent,
            edgeLabelBackground: card,
            tertiaryColor: readHex('--cg-rgb-card-alt', '#f8fafd'),
            fontSize: '15px',
            fontFamily:
              getComputedStyle(document.documentElement).getPropertyValue('--cg-font').trim() ||
              'system-ui, sans-serif',
          },
          flowchart: {
            curve: 'basis',
            padding: 14,
            nodeSpacing: 40,
            rankSpacing: 46,
          },
        });

        const source = withRoleClasses(quoteNodeLabels(chart));
        const { svg } = await mermaid.render(`mermaid-${id}-${themeRevision}`, source);
        if (!live || !containerRef.current) return;
        containerRef.current.innerHTML = svg;

        // Rounded boxes, like every other card in the app. Mermaid has no
        // theme variable for it.
        containerRef.current
          .querySelectorAll('.node rect')
          .forEach((rect) => {
            rect.setAttribute('rx', '10');
            rect.setAttribute('ry', '10');
          });
      } catch (error) {
        // A malformed diagram is a content problem, not a page problem. The
        // lesson around it is still worth reading, so fail to a note rather
        // than taking the route down. The raw chart is logged alongside the
        // error because the error alone names a token, not the line that
        // produced it.
        console.warn('Could not render the lesson diagram:', error, { chart });
        if (live) setFailed(true);
      }
    })();

    return () => {
      live = false;
    };
  }, [chart, id, themeRevision]);

  if (failed) {
    return (
      <p className="rounded-cg border border-line bg-card-alt px-4 py-3 text-sm text-muted">
        This lesson&rsquo;s diagram could not be drawn.
      </p>
    );
  }

  return (
    <div
      ref={containerRef}
      // Diagrams are frequently wider than the column; scroll the diagram
      // rather than the page. Centred, so a narrow chart does not hug the left.
      className="flex justify-center overflow-x-auto rounded-cg border border-line bg-card p-4 [&_svg]:h-auto"
    />
  );
}
