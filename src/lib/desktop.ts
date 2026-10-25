export type DesktopPlatform = 'windows' | 'macos' | 'linux';
export interface DesktopAsset {
  name: string;
  platform: DesktopPlatform;
  architecture: 'x86' | 'x64' | 'arm64' | 'universal';
  size: number;
  url: string;
  sha256: string;
}
export interface DesktopRelease {
  tag: string;
  date: string;
  assets: DesktopAsset[];
}
export interface DesktopCatalog {
  repository: string | null;
  releases: DesktopRelease[];
}

// Validate the checked-in catalog at build time, before rendering download links.
export function validateDesktopCatalog(input: unknown): DesktopCatalog {
  const catalog = input as DesktopCatalog;
  const fail = () => {
    throw new Error('Invalid desktop release catalog');
  };
  if (!catalog || !Array.isArray(catalog.releases)) fail();
  if (catalog.repository !== null && !/^[\w.-]+\/[\w.-]+$/.test(catalog.repository)) fail();
  if (catalog.releases.length && !catalog.repository) fail();
  const tags = new Set<string>();
  for (const release of catalog.releases) {
    if (
      typeof release.tag !== 'string' ||
      !release.tag ||
      tags.has(release.tag) ||
      !/^\d{4}-\d\d-\d\dT/.test(release.date) ||
      !Number.isFinite(Date.parse(release.date)) ||
      !Array.isArray(release.assets) ||
      !release.assets.length
    )
      fail();
    tags.add(release.tag);
    const names = new Set<string>();
    for (const asset of release.assets) {
      if (
        typeof asset.name !== 'string' ||
        !asset.name ||
        /[/\\]/.test(asset.name) ||
        names.has(asset.name) ||
        !['windows', 'macos', 'linux'].includes(asset.platform) ||
        !['x86', 'x64', 'arm64', 'universal'].includes(asset.architecture) ||
        !Number.isSafeInteger(asset.size) ||
        asset.size <= 0 ||
        !/^[a-f0-9]{64}$/.test(asset.sha256)
      )
        fail();
      const expected = `https://github.com/${catalog.repository}/releases/download/${encodeURIComponent(release.tag)}/${encodeURIComponent(asset.name)}`;
      if (asset.url !== expected) fail();
      names.add(asset.name);
    }
  }
  return catalog;
}

// Used only to highlight a platform. No fingerprint, storage or network request.
export function detectDesktopPlatform(
  platform: string,
  userAgent: string,
  touchPoints = 0,
): DesktopPlatform | null {
  if (/Android|iPhone|iPad|iPod/i.test(userAgent) || (/Mac/i.test(platform) && touchPoints > 1))
    return null;
  if (/Win/i.test(platform)) return 'windows';
  if (/Mac/i.test(platform)) return 'macos';
  if (/Linux/i.test(platform)) return 'linux';
  return null;
}
