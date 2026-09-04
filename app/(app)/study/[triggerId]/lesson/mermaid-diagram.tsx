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

        const { svg } = await mermaid.render(`mermaid-${id}`, chart);
        if (live && containerRef.current) containerRef.current.innerHTML = svg;
      } catch (error) {
        // A malformed diagram is a content problem, not a page problem. The
        // lesson around it is still worth reading, so fail to a note rather
        // than taking the route down.
        console.warn('Could not render the lesson diagram:', error);
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
