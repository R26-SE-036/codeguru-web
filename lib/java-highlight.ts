/**
 * Java, split into coloured tokens, line by line.
 *
 * For showing a student's code in the session review with its lines numbered
 * and highlighted. Monaco would do this too, but it is several hundred
 * kilobytes and an editor, for a panel nobody types in. This is a tokenizer,
 * not a parser: it only has to colour first-year Java the way an editor would.
 *
 * Pure, so it is tested directly.
 */

export type TokenKind = 'keyword' | 'literal' | 'type' | 'method' | 'string' | 'number' | 'comment' | 'annotation' | 'plain';

export interface Token {
  text: string;
  kind: TokenKind;
}

const KEYWORDS = new Set(
  (
    'abstract assert break case catch class const continue default do else enum extends final finally ' +
    'for goto if implements import instanceof interface native new package private protected public return ' +
    'static strictfp super switch synchronized this throw throws transient try void volatile while var record yield ' +
    'boolean byte char double float int long short'
  ).split(' '),
);

const LITERALS = new Set(['true', 'false', 'null']);

// One alternative per token kind, tried in order at each position.
const TOKEN = new RegExp(
  [
    /(\/\/[^\n]*)/.source, // 1 line comment
    /(\/\*[\s\S]*?(?:\*\/|$))/.source, // 2 block comment, possibly unclosed
    /("(?:[^"\\\n]|\\.)*"?)/.source, // 3 string
    /('(?:[^'\\\n]|\\.)*'?)/.source, // 4 char
    /(@[A-Za-z_]\w*)/.source, // 5 annotation
    /(\b\d[\d_]*(?:\.\d+)?[lLfFdD]?\b)/.source, // 6 number
    /([A-Za-z_$][\w$]*)/.source, // 7 identifier or keyword
    /([\s\S])/.source, // 8 anything else, one character
  ].join('|'),
  'g',
);

function kindOf(match: RegExpExecArray, code: string): TokenKind {
  if (match[1] || match[2]) return 'comment';
  if (match[3] || match[4]) return 'string';
  if (match[5]) return 'annotation';
  if (match[6]) return 'number';
  const word = match[7];
  if (!word) return 'plain';
  if (KEYWORDS.has(word)) return 'keyword';
  if (LITERALS.has(word)) return 'literal';
  // A name followed by `(` is a call or a declaration.
  if (/^\s*\(/.test(code.slice(match.index + word.length, match.index + word.length + 40))) return 'method';
  if (/^[A-Z]/.test(word)) return 'type';
  return 'plain';
}

/** The code as lines of tokens. A block comment spanning lines is split across them. */
export function highlightJava(source: string): Token[][] {
  const code = source.replace(/\r\n?/g, '\n');
  const lines: Token[][] = [[]];
  const push = (text: string, kind: TokenKind) => {
    const last = lines[lines.length - 1];
    const previous = last[last.length - 1];
    // Neighbouring plain text merges, so a line is a handful of spans rather
    // than one per character.
    if (previous && previous.kind === kind && kind === 'plain') previous.text += text;
    else last.push({ text, kind });
  };

  TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN.exec(code)) !== null) {
    const kind = kindOf(match, code);
    match[0].split('\n').forEach((piece, index) => {
      if (index > 0) lines.push([]);
      if (piece) push(piece, kind);
    });
  }
  return lines;
}
