import { NextResponse } from 'next/server';
import { RELEASES_PAGE, latestVsixUrl } from '@/lib/extension-release';

/**
 * GET /download/vscode-extension - the newest Code Coach extension, as a .vsix.
 *
 * A stable address for a file whose name changes with every release; see
 * lib/extension-release.ts. If GitHub cannot be asked, the releases page is
 * the fallback - one click further, never a dead end.
 *
 * Open without a session (see OPEN_PATHS in middleware.ts): the extension is
 * how many students first meet the platform.
 */
export async function GET() {
  return NextResponse.redirect((await latestVsixUrl()) ?? RELEASES_PAGE, 302);
}
