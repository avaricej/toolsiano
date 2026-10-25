import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { preferredDesktopLocale, safeFilename } from '../src/lib/runtime.ts';

test('desktop language uses the saved choice before the system language', () => {
  assert.equal(preferredDesktopLocale(null, 'ru-RU'), 'ru');
  assert.equal(preferredDesktopLocale(null, 'de-DE'), 'en');
  assert.equal(preferredDesktopLocale('ru', 'en-US'), 'ru');
  assert.equal(preferredDesktopLocale('en', 'ru-RU'), 'en');
  assert.equal(preferredDesktopLocale('../../bad', 'fr'), 'en');
  assert.equal(safeFilename('../../private/result.png'), 'result.png');
  assert.equal(safeFilename('C:\\data\\result?.pdf'), 'result_.pdf');
});

test('desktop permissions expose no general file reads, shell execution or network APIs', async () => {
  const permissions = JSON.parse(
    await readFile(new URL('../src-tauri/capabilities/main.json', import.meta.url), 'utf8'),
  );
  assert.deepEqual(permissions.windows, ['main']);
  assert.equal(permissions.remote, undefined);
  assert.deepEqual(
    permissions.permissions.filter((p: unknown) => typeof p === 'string'),
    ['dialog:allow-save', 'fs:allow-write-file'],
  );
  const config = JSON.parse(
    await readFile(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
  );
  assert.equal(config.app.windows[0].useHttpsScheme, true);
  assert.equal(config.bundle.windows.webviewInstallMode.type, 'offlineInstaller');
  assert.ok(!config.plugins?.updater);
});
