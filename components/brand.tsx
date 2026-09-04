import Link from 'next/link';
import clsx from 'clsx';

/**
 * The wordmark.
 *
 * The glyph is drawn rather than an image file: it has to recolour with the
 * theme, and a PNG cannot. It reads as a chevron-and-spark - the editor
 * bracket the platform lives inside, plus the thing it notices.
 */
export function Brand({
  className,
  href = '/',
  showWord = true,
}: {
  className?: string;
  href?: string | null;
  showWord?: boolean;
}) {
  const inner = (
    <>
      <span className="relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-cg-sm bg-cg-brand shadow-cg-accent">
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
          <path
            d="M9.5 7.5 5.5 12l4 4.5"
            fill="none"
            stroke="white"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="m15.4 6.6.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9z"
            fill="white"
          />
          <path
            d="M13.4 17.6h4.6"
            fill="none"
            stroke="white"
            strokeWidth="2.1"
            strokeLinecap="round"
            opacity="0.75"
          />
        </svg>
      </span>

      {showWord && (
        <span className="flex flex-col leading-none">
          <span className="text-[15px] font-extrabold tracking-tight text-ink">
            Code Guru
          </span>
          {/* Hidden on the narrowest phones, where it wrapped to two lines and
              pushed the bar taller than the controls beside it. */}
          <span className="mt-1 hidden text-[10px] font-semibold uppercase tracking-[0.14em] text-muted min-[400px]:block">
            Adaptive Java practice
          </span>
        </span>
      )}
    </>
  );

  const classes = clsx('flex items-center gap-2.5', className);

  if (href === null) return <span className={classes}>{inner}</span>;

  return (
    <Link href={href} className={clsx(classes, 'cg-focusable rounded-cg-sm')}>
      {inner}
    </Link>
  );
}
