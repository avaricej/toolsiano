import { readdir, readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { installerPlatform, installerArchitecture } from './github-releases.mjs';
const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const architecture = args[args.indexOf('--architecture') + 1];
if (
  !args.includes('--architecture') ||
  !['x86', 'x64', 'arm64', 'universal'].includes(architecture)
)
  throw new Error('Use --architecture x86|x64|arm64|universal');
const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const destination = path.join(root, 'work/desktop-packages');
await mkdir(destination, { recursive: true });
const checksums = [];
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!['deps', 'build', 'incremental', '.fingerprint'].includes(entry.name))
        await collect(file);
      continue;
    }
    const platform = installerPlatform(entry.name);
    if (
      !platform ||
      !entry.name.toLowerCase().startsWith(`toolsiano_${version}_`.toLowerCase()) ||
      !file.includes(path.sep + 'bundle' + path.sep)
    )
      continue;
    if (installerArchitecture(entry.name) !== architecture) continue;
    const extension = entry.name.slice(entry.name.lastIndexOf('.'));
    const name = `Toolsiano_${version}_${platform}_${architecture}${extension}`;
    await copyFile(file, path.join(destination, name));
    const hash = createHash('sha256')
      .update(await readFile(file))
      .digest('hex');
    checksums.push(`${hash}  ${name}`);
    await writeFile(path.join(destination, name + '.sha256'), `${hash}  ${name}\n`);
  }
}
await collect(path.join(root, 'src-tauri/target'));
if (!checksums.length)
  throw new Error('No desktop installers found. Build the requested platform first.');
await copyFile(
  path.join(root, 'work/desktop-dist/toolsiano-source.zip'),
  path.join(destination, 'toolsiano-source.zip'),
);
const allChecksums = [];
for (const name of (await readdir(destination)).sort()) {
  if (name.startsWith(`Toolsiano_${version}_`) && installerPlatform(name)) {
    const hash = createHash('sha256')
      .update(await readFile(path.join(destination, name)))
      .digest('hex');
    allChecksums.push(`${hash}  ${name}`);
  }
}
await writeFile(path.join(destination, 'SHA256SUMS.txt'), allChecksums.join('\n') + '\n');
console.log(
  `Packaged ${checksums.length} installers in work/desktop-packages. Nothing has been published.`,
);
