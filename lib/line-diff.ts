/**
 * Which lines of two programs differ, for the side-by-side after a review.
 *
 * A longest-common-subsequence over lines: every line in one that has no
 * partner in the other is marked. Lines are compared with their whitespace
 * collapsed, so a pair who indented with tabs, or put a brace on its own line
 * the same way the model solution does, is not told those lines are different -
 * the comparison is about what the code does, and indentation is not that.
 *
 * Exercise programs are tens of lines, so the quadratic table is nothing.
 * Past MAX_LINES it is not worth building, and nothing is marked.
 */

export type LineMark = 'same' | 'changed';

export interface LineDiff {
  /** One mark per line of `ours`. */
  ours: LineMark[];
  /** One mark per line of `theirs`. */
  theirs: LineMark[];
  /** Lines of `ours` with no counterpart in `theirs`. */
  changedCount: number;
}

const MAX_LINES = 600;

const normalise = (line: string) => line.trim().replace(/\s+/g, ' ');

function splitLines(code: string): string[] {
  return code.replace(/\r\n?/g, '\n').split('\n');
}

export function lineDiff(ours: string, theirs: string): LineDiff {
  const a = splitLines(ours);
  const b = splitLines(theirs);

  if (a.length > MAX_LINES || b.length > MAX_LINES) {
    return { ours: a.map(() => 'same'), theirs: b.map(() => 'same'), changedCount: 0 };
  }

  const na = a.map(normalise);
  const nb = b.map(normalise);

  // lengths[i][j] = LCS of na[i..] and nb[j..]
  const lengths: number[][] = Array.from({ length: na.length + 1 }, () => new Array(nb.length + 1).fill(0));
  for (let i = na.length - 1; i >= 0; i -= 1) {
    for (let j = nb.length - 1; j >= 0; j -= 1) {
      lengths[i][j] = na[i] === nb[j] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }

  const marksA: LineMark[] = na.map(() => 'changed');
  const marksB: LineMark[] = nb.map(() => 'changed');
  let i = 0;
  let j = 0;
  while (i < na.length && j < nb.length) {
    if (na[i] === nb[j]) {
      marksA[i] = 'same';
      marksB[j] = 'same';
      i += 1;
      j += 1;
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }

  // A blank line is never a difference worth pointing at.
  na.forEach((line, k) => line === '' && (marksA[k] = 'same'));
  nb.forEach((line, k) => line === '' && (marksB[k] = 'same'));

  return { ours: marksA, theirs: marksB, changedCount: marksA.filter((m) => m === 'changed').length };
}
