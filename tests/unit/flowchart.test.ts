/**
 * Reading lesson flowcharts: a straight line becomes a step flow, anything
 * else is left to Mermaid (null).
 */
import { describe, expect, it } from 'vitest';

import { columnsFor, flowPath, parseFlowchart, rolesFor, snakeLayout } from '@/lib/flowchart';

const SHADOWING = `graph TD
  A[Constructor called with parameter name] --> B[Java evaluates right side name]
  B --> C[Java finds local parameter name]
  C --> D[Java assigns parameter back to parameter]
  D --> E[Class field name remains null]
  E --> F[Fix by using this keyword to specify field]`;

describe('flowPath', () => {
  it('reads a straight chart in order, with a role per step', () => {
    const steps = flowPath(SHADOWING)!;
    expect(steps.map((s) => s.id)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(steps.map((s) => s.role)).toEqual(['start', 'step', 'step', 'step', 'problem', 'fix']);
    expect(steps[0].label).toBe('Constructor called with parameter name');
  });

  it('follows the arrows, not the order lines are written in', () => {
    const steps = flowPath('graph TD\n B --> C\n A[First] --> B[Second]\n C[Third]')!;
    expect(steps.map((s) => s.label)).toEqual(['First', 'Second', 'Third']);
  });

  it('handles chains, semicolons, fences, quotes and arrow labels', () => {
    const chart = '```mermaid\ngraph LR; A["Loop (i <= n)"] -->|every pass| B{Is i past the end?} -- yes --> C[ArrayIndexOutOfBoundsException];\n```';
    const steps = flowPath(chart)!;
    expect(steps.map((s) => s.label)).toEqual([
      'Loop (i <= n)',
      'Is i past the end?',
      'ArrayIndexOutOfBoundsException',
    ]);
    expect(steps.map((s) => s.via)).toEqual([undefined, 'every pass', 'yes']);
    expect(steps[1].role).toBe('decision');
    expect(steps[2].role).toBe('problem');
  });

  it('recognises a missing break and fall-through as the mistake', () => {
    const chart = `graph TD
      A[Check grade variable] --> B[Matches case A] --> C[Print Excellent]
      C --> D[No break statement] --> E[Falls through into case B]
      E --> F[Print Good] --> G[Hits break and exits]`;
    expect(flowPath(chart)!.map((s) => s.role)).toEqual([
      'start', 'step', 'step', 'problem', 'problem', 'step', 'end',
    ]);
  });

  it('ignores styling lines', () => {
    const chart = 'flowchart TD\n %% note\n A[One] ==> B[Two]\n classDef x fill:#fff\n style A fill:#f00';
    expect(flowPath(chart)?.map((s) => s.label)).toEqual(['One', 'Two']);
  });

  it.each([
    ['a branch', 'graph TD\n A{Check} -->|yes| B[Go]\n A -->|no| C[Stop]'],
    ['a merge', 'graph TD\n A --> C\n B --> C'],
    ['a loop back', 'graph TD\n A --> B\n B --> C\n C --> B'],
    ['a fan-out with &', 'graph TD\n A --> B & C'],
    ['a subgraph', 'graph TD\n subgraph S\n A --> B\n end'],
    ['a single node', 'graph TD\n A[Alone]'],
    ['not a flowchart', 'sequenceDiagram\n A->>B: hi'],
    ['broken syntax', 'graph TD\n A[Unclosed --> B'],
    ['nothing', ''],
  ])('leaves %s to Mermaid', (_, chart) => {
    expect(flowPath(chart)).toBeNull();
  });
});

describe('rolesFor', () => {
  it('colours a branching chart for Mermaid', () => {
    const graph = parseFlowchart(
      'graph TD\n A[Read the array] --> B{i < length?}\n B -->|yes| C[Print item]\n B -->|no| D[Index out of bounds error]\n C --> B',
    )!;
    expect(Object.fromEntries(rolesFor(graph))).toEqual({
      A: 'start',
      B: 'decision',
      C: 'step',
      D: 'problem',
    });
  });
});

describe('snakeLayout', () => {
  it('runs rows back and forth, turning with a straight arrow down', () => {
    const { cells, links, rows } = snakeLayout(7, 3);
    expect(rows).toBe(3);
    expect(cells).toEqual([
      { row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 },
      { row: 1, col: 2 }, { row: 1, col: 1 }, { row: 1, col: 0 },
      { row: 2, col: 0 },
    ]);
    expect(links.map((l) => l.direction)).toEqual(['right', 'right', 'down', 'left', 'left', 'down']);
    // A turn stays in the column the row ended in.
    expect(links[2]).toEqual({ from: 2, direction: 'down', row: 0, col: 2 });
    // A left arrow sits in the gap on the left of the step it leaves.
    expect(links[3]).toEqual({ from: 3, direction: 'left', row: 1, col: 1 });
  });

  it('is a plain column at one step per row', () => {
    const { cells, links } = snakeLayout(3, 1);
    expect(cells.every((c) => c.col === 0)).toBe(true);
    expect(links.every((l) => l.direction === 'down')).toBe(true);
  });
});

describe('columnsFor', () => {
  it('fits the width, keeps short charts on one row, and makes four a 2x2', () => {
    expect(columnsFor(720, 7)).toBe(3);
    expect(columnsFor(720, 2)).toBe(2);
    expect(columnsFor(720, 4)).toBe(2);
    expect(columnsFor(360, 7)).toBe(1);
    expect(columnsFor(1000, 8)).toBe(4);
  });
});
