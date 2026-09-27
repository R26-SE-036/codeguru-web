import { SAMPLE_FOLDER, SAMPLE_JAVA_FILES } from '@/lib/sample-java';
import { buildZip } from '@/lib/zip';

/**
 * GET /download/sample-java - the user-testing sample files, as a zip that
 * extracts to one sample-java folder to open in VS Code.
 *
 * TEMPORARY, for the user-testing session; see lib/sample-java.ts for
 * everything to remove afterwards.
 *
 * Open without a session (OPEN_PATHS in middleware.ts), so the address can be
 * written on the board and opened before anyone has an account.
 */
export function GET() {
  const zip = buildZip(
    SAMPLE_JAVA_FILES.map((file) => ({ path: `${SAMPLE_FOLDER}/${file.name}`, text: file.text })),
  );

  return new Response(zip, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="code-guru-sample-java.zip"',
      'Content-Length': String(zip.length),
      'Cache-Control': 'no-store',
    },
  });
}
