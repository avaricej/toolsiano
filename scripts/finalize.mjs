import { readdir, readFile, writeFile, stat, mkdir, cp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import JSZip from 'jszip';
import { localize, origins } from './localize.mjs';
const root = process.cwd(),
  dist = path.resolve(root, process.env.TOOLSIANO_DIST || 'dist');
await localize(dist);
for (const directory of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  await cp(path.join(root, 'node_modules/pdfjs-dist', directory),
    path.join(dist, 'pdfjs', directory), {
      recursive: true,
      // Toolsiano renders pages without the optional PDF scripting interpreter.
      filter: (file) => !path.basename(file).startsWith('quickjs-eval'),
    });
}
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const result = [];
  for (const e of entries) {
    if (e.isDirectory() && ['target', 'gen'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) result.push(...(await walk(p)));
    else result.push(p);
  }
  return result;
}
const zip = new JSZip();
for (const name of ['src', 'src-tauri', 'public', 'scripts', 'tests', '.github']) {
  for (const file of await walk(path.join(root, name))) {
    zip.file(path.relative(root, file).replaceAll('\\', '/'), await readFile(file), {
      date: new Date('2026-01-01T00:00:00Z'),
    });
  }
}
for (const name of [
  'package.json',
  'package-lock.json',
  'astro.config.mjs',
  'tsconfig.json',
  'playwright.config.ts',
  'Dockerfile',
  'compose.yaml',
  'Caddyfile',
  'README.md',
  'README.ru.md',
  'LICENSE',
  '.gitignore',
  '.dockerignore',
  '.nvmrc',
  '.prettierrc.json',
  '.prettierignore',
])
  zip.file(name, await readFile(path.join(root, name)), { date: new Date('2026-01-01T00:00:00Z') });
await writeFile(
  path.join(dist, 'toolsiano-source.zip'),
  await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }),
);
const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
let licenses =
  'Toolsiano — installed dependency notices\nVersions: package-lock.json. All installed packages (including build/test tools) are listed.\n';
for (const [location, info] of Object.entries(lock.packages)) {
  if (!location || !location.includes('node_modules/')) continue;
  const folder = path.join(root, location);
  let names;
  try {
    names = await readdir(folder);
  } catch {
    continue;
  }
  licenses += `\n\n===== ${location} @ ${info.version} (${info.license || 'see package'}) =====\n`;
  const licenseNames = names.filter((n) => /^(licen[cs]e|copying|notice)(\.|$|-)/i.test(n));
  for (const name of licenseNames) {
    if ((await stat(path.join(folder, name))).isFile())
      licenses += `\n--- ${name} ---\n${await readFile(path.join(folder, name), 'utf8')}\n`;
  }
  // Some runtime dependencies (e.g. isarray) keep their complete license in README.
  if (!licenseNames.length) {
    for (const name of names.filter(n => /^readme(?:\.|$)/i.test(n))) {
      if (!(await stat(path.join(folder, name))).isFile()) continue;
      const readme = await readFile(path.join(folder, name), 'utf8');
      const start = readme.search(/^#{1,6}\s+licen[cs]e\b/im);
      if (start >= 0) licenses += `\n--- ${name}: license section ---\n${readme.slice(start)}\n`;
    }
  }
}
for (const file of (await walk(path.join(root, 'src/licenses/avif'))).sort()) {
  licenses += `\n\n===== AVIF bundled component: ${path.basename(file)} =====\n${await readFile(file, 'utf8')}\n`;
}
for (const file of (await walk(path.join(dist, 'pdfjs'))).sort()) {
  if (/^(licen[cs]e|copying|notice)([_.-]|$)/i.test(path.basename(file)))
    licenses += `\n\n===== PDF.js bundled component: ${path.relative(path.join(dist, 'pdfjs'), file)} =====\n${await readFile(file, 'utf8')}\n`;
}
await writeFile(path.join(dist, 'third-party-licenses.txt'), licenses);
const files = await walk(dist);
const hashes = {};
for (const file of files) {
  const rel = path.relative(dist, file).replaceAll('\\', '/');
  hashes[rel] = createHash('sha256')
    .update(await readFile(file))
    .digest('hex');
}
const release = createHash('sha256').update(JSON.stringify(hashes)).digest('hex').slice(0, 16);
await writeFile(
  path.join(dist, 'build-info.json'),
  JSON.stringify({ version: lock.version, release, files: hashes }, null, 2),
);
const routes = files
  .map((f) => '/' + path.relative(dist, f).replaceAll('\\', '/'))
  .filter((f) => !f.endsWith('.zip') && !f.endsWith('.txt') && !f.endsWith('/404.html'))
  .map((f) => (f.endsWith('/index.html') ? f.slice(0, -10) : f));
routes.push('/build-info.json');
const worker =
  `const RELEASE=${JSON.stringify(release)};const ASSETS=${JSON.stringify(routes)};\n` +
  (await readFile('scripts/offline-worker.js', 'utf8'));
await writeFile(path.join(dist, 'sw.js'), worker);

for (const lang of ['en', 'ru']) {
  const pages = routes.filter((r) => r.startsWith('/' + lang + '/') && r.endsWith('/'));
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map((r) => `<url><loc>${origins[lang]}${r}</loc></url>`).join('')}</urlset>`;
  await writeFile(path.join(dist, 'sitemap-' + lang + '.xml'), xml);
  await writeFile(
    path.join(dist, 'robots-' + lang + '.txt'),
    'User-agent: *\nAllow: /\nSitemap: ' + origins[lang] + '/sitemap.xml\n',
  );
  if (lang === 'ru') {
    await writeFile(path.join(dist, 'sitemap.xml'), xml);
    await writeFile(
      path.join(dist, 'robots.txt'),
      'User-agent: *\nAllow: /\nSitemap: ' + origins.ru + '/sitemap.xml\n',
    );
  }
}
console.log(
  `Release ${release}: ${files.length} files, ${routes.length} offline assets. Source archive and dependency notices generated.`,
);
