import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

test('release CLI imports metadata, saves aggregate reports and preserves the catalog on failure', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'toolsiano-releases-'));
  try {
    for (const directory of ['scripts', 'src/lib', 'src/data'])
      await mkdir(path.join(root, directory), { recursive: true });
    for (const file of [
      'scripts/github-releases.mjs',
      'scripts/sync-desktop-releases.mjs',
      'scripts/download-stats.mjs',
      'src/lib/desktop.ts',
    ])
      await copyFile(new URL('../' + file, import.meta.url), path.join(root, file));
    const mock = path.join(root, 'mock.mjs');
    await writeFile(
      mock,
      `
      globalThis.fetch = async url => {
        if (!String(url).startsWith('https://api.github.com/repos/example/toolsiano/releases?')) throw new Error('Unexpected URL');
        return Response.json([{ tag_name: 'v1.0.0', published_at: '2026-10-25T12:00:00Z', draft: false, prerelease: false, assets: [
          { id: 1, name: 'Toolsiano_x64.exe', state: 'uploaded', size: 12345, download_count: 42, digest: process.env.BAD_DIGEST ? '' : 'sha256:' + 'a'.repeat(64), browser_download_url: 'https://github.com/example/toolsiano/releases/download/v1.0.0/Toolsiano_x64.exe' },
          { id: 2, name: 'source.zip', state: 'uploaded', size: 99, download_count: 100 }
        ] }]);
      };
    `,
    );
    const run = (file: string, env = process.env) =>
      execFileSync(
        process.execPath,
        ['--import', pathToFileURL(mock).href, path.join(root, 'scripts', file), '--repo', 'example/toolsiano'],
        { cwd: root, env, stdio: 'pipe' },
      );
    run('sync-desktop-releases.mjs');
    const before = await readFile(path.join(root, 'src/data/desktop-releases.json'), 'utf8');
    const catalog = JSON.parse(before);
    assert.equal(catalog.releases[0].assets.length, 1);
    assert.equal(catalog.releases[0].assets[0].sha256, 'a'.repeat(64));
    assert.throws(() => run('sync-desktop-releases.mjs', { ...process.env, BAD_DIGEST: '1' }));
    assert.equal(await readFile(path.join(root, 'src/data/desktop-releases.json'), 'utf8'), before);
    run('download-stats.mjs');
    const report = await readFile(path.join(root, 'work/download-statistics/index.html'), 'utf8');
    assert.ok(report.includes('Toolsiano_x64.exe'));
    assert.ok(report.includes('<strong>42</strong>'));
    assert.ok(!report.includes('source.zip'));
    assert.ok(!report.includes('<script'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
