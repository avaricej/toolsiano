import { writeFile, rename } from 'node:fs/promises';
import {
  fetchReleases,
  installerPlatform,
  installerArchitecture,
  repositoryArgument,
} from './github-releases.mjs';
import { validateDesktopCatalog } from '../src/lib/desktop.ts';

const repository = repositoryArgument(process.argv.slice(2));
const upstream = await fetchReleases(repository);
const releases = upstream
  .map((release) => ({
    tag: release.tag_name,
    date: release.published_at,
    assets: release.assets
      .filter((asset) => asset.state === 'uploaded' && installerPlatform(asset.name))
      .map((asset) => ({
        name: asset.name,
        platform: installerPlatform(asset.name),
        architecture: installerArchitecture(asset.name),
        size: asset.size,
        url: asset.browser_download_url,
        sha256: asset.digest?.replace(/^sha256:/, '') || '',
      })),
  }))
  .filter((release) => release.assets.length)
  .sort((a, b) => b.date.localeCompare(a.date));
const catalog = validateDesktopCatalog({ repository, releases });
const target = new URL('../src/data/desktop-releases.json', import.meta.url);
const temporary = new URL('../src/data/desktop-releases.json.tmp', import.meta.url);
await writeFile(temporary, JSON.stringify(catalog, null, 2) + '\n');
await rename(temporary, target);
console.log(
  `Saved ${releases.length} stable desktop releases. Rebuild the website to publish these links.`,
);
