'use client';

/**
 * The last resort: an error thrown by the ROOT layout itself.
 *
 * At that point the app's own <html> and <body> never rendered, so this file
 * has to supply them - it replaces the document rather than rendering inside
 * it. That also means none of the design tokens are loaded, because they come
 * from the stylesheet the root layout imports. Everything here is therefore
 * inline and self-contained, and it is the one screen in the app that cannot
 * follow the theme.
 *
 * It should never be seen. It exists so that if it ever is, it is a legible
 * page rather than a blank white document.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: '1.25rem',
          background: '#F7F8FC',
          color: '#33415C',
          fontFamily:
            "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <div style={{ maxWidth: '28rem', textAlign: 'center' }}>
          <h1
            style={{
              margin: 0,
              fontSize: '1.5rem',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              color: '#0B1220',
            }}
          >
            Code Guru could not start
          </h1>
          <p style={{ marginTop: '0.75rem', lineHeight: 1.6 }}>
            Something failed before the page could be drawn. Reloading usually clears
            it.
          </p>

          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: '1.75rem',
              height: '2.75rem',
              padding: '0 1.5rem',
              border: 0,
              borderRadius: '10px',
              background: '#4F46E5',
              color: '#fff',
              fontSize: '0.95rem',
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            Reload
          </button>

          {error.digest && (
            <p
              style={{
                marginTop: '1.5rem',
                fontSize: '0.75rem',
                color: '#94A3B8',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              }}
            >
              Reference {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
