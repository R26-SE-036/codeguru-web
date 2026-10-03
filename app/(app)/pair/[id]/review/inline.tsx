import { Fragment } from 'react';

/**
 * `code` in backticks as code, **this** as bold, *this* as italic, everything
 * else as text - the three the model actually uses.
 *
 * Ligatures are off in code: the mono font would draw `<=` as a single
 * symbol, and a beginner has to type the two characters.
 */
export function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g).map((part, index) => {
        if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) {
          return (
            <code
              key={index}
              className="rounded-[5px] bg-inset px-1.5 py-0.5 font-mono text-[0.88em] font-medium text-ink [font-variant-ligatures:none]"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        if (part.length > 4 && part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={index} className="font-semibold text-ink">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.length > 2 && part.startsWith('*') && part.endsWith('*')) {
          return <em key={index}>{part.slice(1, -1)}</em>;
        }
        return <Fragment key={index}>{part}</Fragment>;
      })}
    </>
  );
}
