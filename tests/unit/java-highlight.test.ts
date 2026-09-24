/**
 * The code panel in the session review: Java coloured line by line.
 */
import { describe, expect, it } from 'vitest';

import { highlightJava, type TokenKind } from '@/lib/java-highlight';

const kinds = (line: { text: string; kind: TokenKind }[]) =>
  line.filter((t) => t.kind !== 'plain').map((t) => `${t.kind}:${t.text}`);

describe('highlightJava', () => {
  it('keeps one entry per line, blank lines included, and loses no text', () => {
    const code = 'class A {\r\n\n  int x = 1;\n}';
    const lines = highlightJava(code);

    expect(lines).toHaveLength(4);
    expect(lines.map((line) => line.map((t) => t.text).join(''))).toEqual(['class A {', '', '  int x = 1;', '}']);
  });

  it('colours the parts of a statement', () => {
    const [line] = highlightJava('for (int i = 10; i >= 1; i--) System.out.println("Go " + i); // count');

    expect(kinds(line)).toEqual([
      'keyword:for',
      'keyword:int',
      'number:10',
      'number:1',
      'type:System',
      'method:println',
      'string:"Go "',
      'comment:// count',
    ]);
  });

  it('carries a block comment across lines', () => {
    const lines = highlightJava('/* one\n two */ return null;');

    expect(kinds(lines[0])).toEqual(['comment:/* one']);
    expect(kinds(lines[1])).toEqual(['comment: two */', 'keyword:return', 'literal:null']);
  });

  it('does not run away on an unclosed string', () => {
    const lines = highlightJava('String s = "open\nint y;');
    expect(kinds(lines[1])).toEqual(['keyword:int']);
  });
});
