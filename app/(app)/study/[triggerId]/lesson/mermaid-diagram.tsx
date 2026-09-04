'use client';

import { useEffect, useId, useRef, useState } from 'react';

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
    chart
      // A fenced block occasionally survives the model's JSON, and mermaid
      // will not parse the fence.
      .replace(/^\s*```(?:mermaid)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
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

export default function MermaidDiagram({ chart }: { chart: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  // Mermaid needs a DOM id unique per diagram; useId gives a stable one that
  // matches between renders.
  const id = useId().replace(/:/g, '');

  useEffect(() => {
    let live = true;

    (async () => {
      try {
        const mermaid = (await import('mermaid')).default;

        const readToken = (name: string, fallback: string) => {
          const value = getComputedStyle(document.documentElement)
            .getPropertyValue(name)
            .trim();
          return value ? `rgb(${value})` : fallback;
        };

        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'base',
          themeVariables: {
            background: readToken('--cg-rgb-card', '#ffffff'),
            primaryColor: readToken('--cg-rgb-accent-soft', '#e0e7ff'),
            primaryBorderColor: readToken('--cg-rgb-accent', '#2563eb'),
            primaryTextColor: readToken('--cg-rgb-ink', '#0f1b33'),
            lineColor: readToken('--cg-rgb-border-strong', '#94a3b8'),
            fontFamily: getComputedStyle(document.documentElement)
              .getPropertyValue('--cg-font')
              .trim() || 'system-ui, sans-serif',
          },
        });

        const { svg } = await mermaid.render(`mermaid-${id}`, quoteNodeLabels(chart));
        if (live && containerRef.current) containerRef.current.innerHTML = svg;
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
  }, [chart, id]);

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
      // rather than the page.
      className="overflow-x-auto rounded-cg border border-line bg-card p-4"
    />
  );
}
