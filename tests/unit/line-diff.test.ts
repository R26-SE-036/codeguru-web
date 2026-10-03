import { describe, expect, it } from 'vitest';

import { lineDiff } from '@/lib/line-diff';

const OURS = [
  'public class Main {',
  '    public static void main(String[] args) {',
  '        for (int i = 1; i < 5; i++) {',
  '            System.out.println(i);',
  '        }',
  '    }',
  '}',
].join('\n');

const THEIRS = OURS.replace('i < 5', 'i <= 5');

describe('lineDiff', () => {
  it('marks only the line that differs, on both sides', () => {
    const diff = lineDiff(OURS, THEIRS);
    expect(diff.ours).toEqual(['same', 'same', 'changed', 'same', 'same', 'same', 'same']);
    expect(diff.theirs).toEqual(diff.ours);
    expect(diff.changedCount).toBe(1);
  });

  it('ignores indentation and spacing', () => {
    const tabbed = OURS.replace(/^ {4}/gm, '\t').replace('i++', 'i  ++');
    expect(lineDiff(tabbed, OURS.replace('i++', 'i ++')).changedCount).toBe(0);
  });

  it('marks a line one side has and the other does not', () => {
    const extra = OURS.replace('System.out.println(i);', 'int x = i;\n            System.out.println(i);');
    const diff = lineDiff(extra, OURS);
    expect(diff.ours.filter((m) => m === 'changed')).toHaveLength(1);
    expect(diff.theirs.every((m) => m === 'same')).toBe(true);
  });

  it('never marks a blank line', () => {
    const diff = lineDiff('a\n\nb', 'a\nc');
    expect(diff.ours).toEqual(['same', 'same', 'changed']);
  });

  it('marks everything in an empty editor against a solution', () => {
    const diff = lineDiff('', 'int x = 1;');
    expect(diff.ours).toEqual(['same']);
    expect(diff.theirs).toEqual(['changed']);
  });
});
