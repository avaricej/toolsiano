import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

test('release preparation rejects corrupted installers and preserves the previous manifest', async () => {
  const root = path.resolve('work'); await mkdir(root, { recursive: true });
  const folder = await mkdtemp(path.join(root, 'release-check-'));
  try {
    const { version } = JSON.parse(await readFile('package.json', 'utf8'));
    for (const arch of ['x64', 'x86']) {
      const name = `Toolsiano_${version}_windows_${arch}.exe`;
      const bytes = Buffer.from(`synthetic ${arch} installer fixture`);
      await writeFile(path.join(folder, name), bytes);
      await writeFile(path.join(folder, name + '.sha256'), createHash('sha256').update(bytes).digest('hex') + '  ' + name);
    }
    await writeFile(path.join(folder, 'toolsiano-source.zip'), 'synthetic source fixture');
    const run = () => spawnSync(process.execPath, ['scripts/prepare-release.mjs', folder], { encoding: 'utf8' });
    assert.equal(run().status, 0);
    const manifest = await readFile(path.join(folder, 'SHA256SUMS.txt'), 'utf8');
    assert.equal(manifest.trim().split('\n').length, 3);
    const notes = await readFile(path.join(folder, 'RELEASE_NOTES.md'), 'utf8');
    assert.match(notes, /Unsigned builds/); assert.match(notes, /Сборки не подписаны/);
    await writeFile(path.join(folder, `Toolsiano_${version}_windows_x86.exe`), 'corrupt');
    assert.notEqual(run().status, 0);
    assert.equal(await readFile(path.join(folder, 'SHA256SUMS.txt'), 'utf8'), manifest);
  } finally {
    if (!folder.startsWith(root + path.sep)) throw new Error('Unsafe test cleanup path');
    await rm(folder, { recursive: true, force: true });
  }
});
