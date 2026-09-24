/**
 * Read a lesson's Mermaid flowchart as data.
 *
 * Most lesson diagrams are a straight line of steps - "the loop starts, i
 * reaches length, the index is out of bounds, fix the condition" - and Mermaid
 * draws those as a tall column of identical lilac boxes. Reading the chart
 * ourselves lets the lesson draw a straight line as a proper flow diagram instead,
 * with each step coloured by what it is: where it starts, what goes wrong, the
 * fix. Anything that is not a straight line (a branch, a loop, a subgraph) is
 * left to Mermaid, which lays graphs out far better than we could.
 *
 * Pure string handling, no DOM, so it runs in the unit suite.
 */

export type FlowShape = 'box' | 'round' | 'decision';
export type FlowRole = 'start' | 'step' | 'decision' | 'problem' | 'fix' | 'end';

export interface FlowNode {
  id: string;
  label: string;
  shape: FlowShape;
}

export interface FlowEdge {
  from: string;
  to: string;
  label?: string;
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface FlowStep extends FlowNode {
  role: FlowRole;
  /** The label on the arrow leading INTO this step, if the chart gave one. */
  via?: string;
}

/** A fenced block occasionally survives the model's JSON. */
export function stripFences(chart: string): string {
  return chart.replace(/^\s*```(?:mermaid)?\s*/i, '').replace(/\s*```\s*$/i, '');
}

// Longest opener first: `((` must win over `(`.
const SHAPES: [open: string, close: string[], shape: FlowShape][] = [
  ['(((', [')))'], 'round'],
  ['((', ['))'], 'round'],
  ['([', ['])'], 'round'],
  ['[[', [']]'], 'box'],
  ['[(', [')]'], 'box'],
  ['[/', ['/]', '\\]'], 'box'],
  ['[\\', ['\\]', '/]'], 'box'],
  ['{{', ['}}'], 'box'],
  ['[', [']'], 'box'],
  ['(', [')'], 'round'],
  ['{', ['}'], 'decision'],
  ['>', [']'], 'box'],
];

// `A -- yes --> B`, `A -. maybe .-> B`, `A == always ==> B`.
const TEXT_EDGE = /^<?(--|==|-\.)\s*([^\s>|=.-][^]*?)\s*(-{2,}>|={2,}>|\.-+>|-{3,}|={3,}|\.-+)/;
// `-->`, `---`, `==>`, `-.->`, `--x`, `--o`, `<-->`.
const PLAIN_EDGE = /^<?(?:-{2,}|={2,}|-\.+-)[>xo]?/;
const PIPE_LABEL = /^\s*\|([^|]*)\|/;
const HEADER = /^(?:graph|flowchart)(?:\s+(?:TD|TB|BT|RL|LR))?\b\s*/i;
// Lines that style the chart rather than describe it.
const IGNORED = /^(?:%%|classDef\s|class\s|style\s|linkStyle\s|click\s|direction\s)/i;

function cleanLabel(raw: string): string {
  return raw
    .replace(/^"|"$/g, '')
    .replace(/#quot;/g, '"')
    .replace(/#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Split one line on `;` outside labels. */
function splitStatements(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let depth = 0;
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && '[({'.includes(ch)) depth++;
    else if (!quoted && ')]}'.includes(ch)) depth = Math.max(0, depth - 1);
    else if (!quoted && depth === 0 && ch === ';') {
      out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out.map((s) => s.trim()).filter(Boolean);
}

/**
 * The chart's nodes and edges, or null for anything this does not understand.
 * Null is not an error: the caller hands the chart to Mermaid instead.
 */
export function parseFlowchart(chart: string): FlowGraph | null {
  const lines = stripFences(chart).split(/\r?\n/);
  const nodes = new Map<string, FlowNode>();
  const edges: FlowEdge[] = [];
  let sawHeader = false;

  const touch = (id: string, label?: string, shape?: FlowShape) => {
    const existing = nodes.get(id);
    if (!existing) nodes.set(id, { id, label: label ?? id, shape: shape ?? 'box' });
    else if (label !== undefined) {
      existing.label = label;
      existing.shape = shape ?? existing.shape;
    }
  };

  /** Parse `id` or `id[label]` at the start of `s`; returns chars consumed. */
  const readNode = (s: string): { id: string; used: number } | null => {
    const idMatch = /^[A-Za-z0-9_]+/.exec(s);
    if (!idMatch) return null;
    const id = idMatch[0];
    let rest = s.slice(id.length);
    let used = id.length;

    const opener = SHAPES.find(([open]) => rest.startsWith(open));
    if (!opener) {
      touch(id);
    } else {
      const [open, closers, shape] = opener;
      rest = rest.slice(open.length);
      used += open.length;
      let label: string;
      const lead = rest.length - rest.trimStart().length;

      if (rest.trimStart().startsWith('"')) {
        const start = lead + 1;
        const end = rest.indexOf('"', start);
        if (end < 0) return null;
        label = rest.slice(start, end);
        const after = rest.slice(end + 1);
        const closer = closers.find((c) => after.trimStart().startsWith(c));
        if (!closer) return null;
        const gap = after.length - after.trimStart().length;
        used += end + 1 + gap + closer.length;
      } else {
        const hits = closers
          .map((c) => ({ c, at: rest.indexOf(c) }))
          .filter((h) => h.at >= 0)
          .sort((a, b) => a.at - b.at);
        if (!hits.length) return null;
        label = rest.slice(0, hits[0].at);
        used += hits[0].at + hits[0].c.length;
      }
      touch(id, cleanLabel(label), shape);
    }

    const cls = /^:::[\w-]+/.exec(s.slice(used));
    if (cls) used += cls[0].length;
    return { id, used };
  };

  for (const rawLine of lines) {
    for (let statement of splitStatements(rawLine)) {
      if (!sawHeader) {
        const header = HEADER.exec(statement);
        if (!header) return null;
        sawHeader = true;
        statement = statement.slice(header[0].length).trim();
        if (!statement) continue;
      }
      if (IGNORED.test(statement)) continue;
      if (/^(?:subgraph|end)\b/i.test(statement)) return null;

      let rest = statement;
      const first = readNode(rest);
      if (!first) return null;
      rest = rest.slice(first.used).trimStart();
      let from = first.id;

      while (rest) {
        // `A & B --> C` fans out; not a straight line, so not ours.
        if (rest.startsWith('&')) return null;

        let edgeLabel: string | undefined;
        const text = TEXT_EDGE.exec(rest);
        const plain = text ? null : PLAIN_EDGE.exec(rest);
        if (text) {
          edgeLabel = text[2];
          rest = rest.slice(text[0].length);
        } else if (plain) {
          rest = rest.slice(plain[0].length);
          const pipe = PIPE_LABEL.exec(rest);
          if (pipe) {
            edgeLabel = pipe[1];
            rest = rest.slice(pipe[0].length);
          }
        } else {
          return null;
        }

        rest = rest.trimStart();
        const next = readNode(rest);
        if (!next) return null;
        const label = edgeLabel !== undefined ? cleanLabel(edgeLabel) : '';
        edges.push({ from, to: next.id, ...(label ? { label } : {}) });
        from = next.id;
        rest = rest.slice(next.used).trimStart();
      }
    }
  }

  if (!sawHeader || nodes.size === 0) return null;
  return { nodes: [...nodes.values()], edges };
}

const FIX =
  /^(?:to fix|fix|fixed|solution|correct|correctly|use|using|instead|change|replace|add|declare|initiali[sz]e|update|increment|always|make sure|remember)\b|\b(?:fix|fixes|fixed|solution|solved|resolved?)\b/i;
const PROBLEM =
  /^no\b|\w+(?:exception|error)\b|\b(?:null|errors?|exceptions?|crash(?:es|ed)?|fail(?:s|ed|ure)?|wrong|bugs?|incorrect|infinite|never|lost|out of bounds|outofbounds|off by one|mistakes?|skip(?:s|ped)?|missing|without|overflows?|undefined|unexpected|unchanged|ignored|garbage|problem|broken|forgot|forgets|shadow(?:s|ed|ing)?|falls? through|falling through|fall-?through|stuck|forever|hangs?|not (?:updated|changed|incremented|initiali[sz]ed|called|reached|stopped))\b/i;

/**
 * What a step is for, so it can be coloured and titled.
 *
 * Read from the label's words, so it is a guess - which is why the fallback is
 * a plain numbered step, never a claim. A step is only called "the fix" or
 * "what goes wrong" when its own words say so.
 */
export function roleOf(node: FlowNode, position: { first: boolean; last: boolean }): FlowRole {
  if (node.shape === 'decision') return 'decision';
  if (FIX.test(node.label)) return 'fix';
  if (PROBLEM.test(node.label)) return 'problem';
  if (position.first) return 'start';
  if (position.last) return 'end';
  return 'step';
}

/** Every node's role, for colouring a chart Mermaid draws. */
export function rolesFor(graph: FlowGraph): Map<string, FlowRole> {
  const into = new Set(graph.edges.map((e) => e.to));
  const out = new Set(graph.edges.map((e) => e.from));
  return new Map(
    graph.nodes.map((node) => [
      node.id,
      roleOf(node, { first: !into.has(node.id), last: !out.has(node.id) }),
    ]),
  );
}

/**
 * The chart as an ordered list of steps when it is one straight line - every
 * node reached exactly once, one arrow in and one out - or null otherwise.
 */
export function flowPath(chart: string | undefined | null): FlowStep[] | null {
  if (!chart) return null;
  const graph = parseFlowchart(chart);
  if (!graph || graph.nodes.length < 2) return null;
  if (graph.edges.length !== graph.nodes.length - 1) return null;

  const next = new Map<string, FlowEdge>();
  const hasParent = new Set<string>();
  for (const edge of graph.edges) {
    if (next.has(edge.from) || hasParent.has(edge.to) || edge.from === edge.to) return null;
    next.set(edge.from, edge);
    hasParent.add(edge.to);
  }

  const heads = graph.nodes.filter((n) => !hasParent.has(n.id));
  if (heads.length !== 1) return null;

  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const steps: FlowStep[] = [];
  let current: FlowNode | undefined = heads[0];
  let via: string | undefined;
  while (current) {
    const last = !next.has(current.id);
    steps.push({
      ...current,
      role: roleOf(current, { first: steps.length === 0, last }),
      ...(via ? { via } : {}),
    });
    const edge = next.get(current.id);
    via = edge?.label;
    current = edge ? byId.get(edge.to) : undefined;
  }

  return steps.length === graph.nodes.length ? steps : null;
}

/**
 * How many steps sit side by side at a given width.
 *
 * A short chart stays on one row; four steps make a 2x2 rather than three and
 * a straggler.
 */
export function columnsFor(width: number, count: number): number {
  const fit = width >= 920 ? 4 : width >= 600 ? 3 : width >= 400 ? 2 : 1;
  if (count <= fit) return Math.max(1, count);
  if (count === 4) return 2;
  return fit;
}

export interface SnakeCell {
  row: number;
  col: number;
}

export interface SnakeLink {
  /** The step the arrow leaves; it points at `from + 1`. */
  from: number;
  direction: 'right' | 'left' | 'down';
  /**
   * Where the arrow sits. Right/left: in the step's row, in the gap after
   * column `col`. Down: in the gap below `row`, in column `col`.
   */
  row: number;
  col: number;
}

/**
 * Lay steps out in rows that snake: left to right, then right to left, and so
 * on. The last step of a row sits directly above the first of the next, so
 * every turn is a straight arrow down - no line has to cross the diagram.
 */
export function snakeLayout(count: number, cols: number): { cells: SnakeCell[]; links: SnakeLink[]; rows: number } {
  const width = Math.max(1, cols);
  const cells: SnakeCell[] = Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / width);
    const k = i % width;
    return { row, col: row % 2 === 0 ? k : width - 1 - k };
  });

  const links: SnakeLink[] = [];
  for (let i = 0; i + 1 < count; i++) {
    const a = cells[i];
    const b = cells[i + 1];
    if (a.row === b.row) {
      links.push({
        from: i,
        direction: b.col > a.col ? 'right' : 'left',
        row: a.row,
        col: Math.min(a.col, b.col),
      });
    } else {
      links.push({ from: i, direction: 'down', row: a.row, col: a.col });
    }
  }

  return { cells, links, rows: count ? cells[count - 1].row + 1 : 0 };
}
