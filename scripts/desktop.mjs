import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const env = { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' };
const localCargo = path.join(root, 'work', 'cargo');
if (existsSync(path.join(localCargo, 'bin', 'cargo.exe'))) {
  env.CARGO_HOME = localCargo;
  env.RUSTUP_HOME = path.join(root, 'work', 'rustup');
  const originalPath = env.PATH || env.Path || process.env.PATH || '';
  delete env.PATH;
  delete env.Path;
  env[process.platform === 'win32' ? 'Path' : 'PATH'] =
    path.join(localCargo, 'bin') + path.delimiter + originalPath;
}
const args = process.argv.slice(2);
if (['build', 'dev'].includes(args[0])) {
  const index = args.indexOf('--target');
  const target = index >= 0 ? args[index + 1] : '';
  env.TOOLSIANO_DESKTOP_ARCH = target.startsWith('i686')
    ? 'x86'
    : target.includes('universal')
      ? 'universal'
      : target.startsWith('aarch64')
        ? 'arm64'
        : 'x64';
  if (target && !target.startsWith('universal')) env.TOOLSIANO_DESKTOP_TARGET = target;
}
if (!['build', 'dev', 'info', 'icon', 'frontend'].includes(args[0]))
  throw new Error('Expected build, dev, info, icon or frontend');
const command =
  args[0] === 'frontend'
    ? [path.join(root, 'scripts/build-desktop.mjs')]
    : [path.join(root, 'node_modules/@tauri-apps/cli/tauri.js'), ...args];
const result = spawnSync(process.execPath, command, {
  cwd: root,
  env,
  stdio: 'inherit',
  windowsHide: true,
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
