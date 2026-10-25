import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDesktopCatalog, detectDesktopPlatform } from '../src/lib/desktop.ts';
import { installerArchitecture, installerPlatform } from '../scripts/github-releases.mjs';

test('desktop catalog rejects unsafe links, missing checksums and invalid metadata', () => {
  const catalog = {
    repository: 'example/toolsiano',
    releases: [
      {
        tag: 'v1.0.0',
        date: '2026-10-25T12:00:00Z',
        assets: [
          {
            name: 'Toolsiano_x64.exe',
            platform: 'windows',
            architecture: 'x64',
            size: 12345,
            sha256: 'a'.repeat(64),
            url: 'https://github.com/example/toolsiano/releases/download/v1.0.0/Toolsiano_x64.exe',
          },
        ],
      },
    ],
  };
  assert.deepEqual(validateDesktopCatalog(catalog), catalog);
  assert.deepEqual(validateDesktopCatalog({ repository: null, releases: [] }).releases, []);
  for (const change of [
    { url: 'javascript:alert(1)' },
    { url: 'https://github.com/other/repo/releases/download/v1.0.0/Toolsiano_x64.exe' },
    { sha256: '' },
    { size: -1 },
    { name: '../x.exe' },
  ]) {
    const invalid = structuredClone(catalog);
    Object.assign(invalid.releases[0].assets[0], change);
    assert.throws(() => validateDesktopCatalog(invalid));
  }
});

test('platform hints handle desktop and do not identify mobile devices as desktop', () => {
  assert.equal(detectDesktopPlatform('Win32', 'Windows'), 'windows');
  assert.equal(detectDesktopPlatform('MacIntel', 'Macintosh', 0), 'macos');
  assert.equal(detectDesktopPlatform('Linux x86_64', 'Linux'), 'linux');
  assert.equal(detectDesktopPlatform('MacIntel', 'Macintosh', 5), null);
  assert.equal(detectDesktopPlatform('Linux', 'Android'), null);
  assert.equal(detectDesktopPlatform('', ''), null);
});

test('release tools count installer files and exclude update packages and signatures', () => {
  assert.equal(installerPlatform('Toolsiano_x64.exe'), 'windows');
  assert.equal(installerPlatform('Toolsiano_universal.dmg'), 'macos');
  assert.equal(installerPlatform('Toolsiano_arm64.AppImage'), 'linux');
  for (const name of [
    'source.zip',
    'app.exe.sig',
    'latest.json',
    'app.app.tar.gz',
    'SHA256SUMS.txt',
  ])
    assert.equal(installerPlatform(name), null);
  assert.equal(installerArchitecture('Toolsiano_x86_64.AppImage'), 'x64');
  assert.equal(installerArchitecture('Toolsiano_aarch64.deb'), 'arm64');
  assert.equal(installerArchitecture('Toolsiano_universal.dmg'), 'universal');
  assert.throws(() => installerArchitecture('Toolsiano.exe'));
});
