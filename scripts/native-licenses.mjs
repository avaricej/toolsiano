import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

export async function nativeLicenses(root) {
  const host = spawnSync('rustc', ['-vV'], { encoding: 'utf8', windowsHide: true });
  if (host.status !== 0)
    throw new Error(
      'Rust is required to build the desktop frontend. Run desktop:build using the configured toolchain.',
    );
  const triple =
    process.env.TOOLSIANO_DESKTOP_TARGET || host.stdout.match(/^host: (.+)$/m)?.[1]?.trim();
  const result = spawnSync(
    'cargo',
    ['metadata', '--locked', '--format-version', '1', '--filter-platform', triple],
    {
      cwd: path.join(root, 'src-tauri'),
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
      windowsHide: true,
    },
  );
  if (result.status !== 0)
    throw new Error(result.stderr || 'Could not read Cargo license metadata');
  const metadata = JSON.parse(result.stdout);
  let notices =
    'Toolsiano desktop — Rust dependency notices\nSee Cargo.lock for exact dependency versions.\n';
  for (const pkg of metadata.packages.sort((a, b) => a.name.localeCompare(b.name))) {
    const folder = path.dirname(pkg.manifest_path);
    notices += `\n\n===== ${pkg.name} @ ${pkg.version} (${pkg.license || 'see license file'}) =====\n`;
    const names = new Set(
      (await readdir(folder)).filter((name) => /^(licen[cs]e|copying|notice)(\.|$|-)/i.test(name)),
    );
    if (pkg.license_file) names.add(pkg.license_file);
    for (const name of names) {
      try {
        notices += `\n--- ${name} ---\n${await readFile(path.resolve(folder, name), 'utf8')}\n`;
      } catch (error) {
        if (error.code !== 'EISDIR') throw error;
      }
    }
  }
  return notices;
}
