/**
 * Where the newest Code Coach extension can be downloaded.
 *
 * The extension is released on GitHub as `extension-v<version>` with the
 * .vsix attached, and the file name carries the version
 * (code-coach-0.1.0.vsix). A link written into the site would go stale at the
 * next release, so this asks GitHub for the newest one.
 *
 * GitHub allows 60 unauthenticated API calls an hour per address, so the answer
 * is cached for an hour: the server asks at most once per hour, however many
 * students download.
 */

const REPO = 'R26-SE-036/code-coach';
export const RELEASES_PAGE = `https://github.com/${REPO}/releases`;

interface Release {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  assets: { name: string; browser_download_url: string }[];
}

export async function latestVsixUrl(): Promise<string | null> {
  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=20`, {
      headers: { Accept: 'application/vnd.github+json' },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;

    const releases = (await response.json()) as Release[];
    // Newest first, as GitHub returns them. Only extension releases, never a
    // draft or prerelease - this is the link students are given.
    for (const release of releases) {
      if (release.draft || release.prerelease || !release.tag_name.startsWith('extension-v')) continue;
      const vsix = release.assets.find((asset) => asset.name.endsWith('.vsix'));
      if (vsix) return vsix.browser_download_url;
    }
  } catch {
    // Falls through to the releases page.
  }
  return null;
}
