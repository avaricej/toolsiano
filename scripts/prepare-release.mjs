import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const directory = path.resolve(process.argv[2] || 'work/desktop-packages');
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Expected a stable release version');
const history = JSON.parse(await readFile('src/data/changelog.json', 'utf8'));
const entry = history.find(item => item.version === version);
if (!entry) throw new Error('Add release notes to the changelog before preparing a release');
const checksums = [];
for (const architecture of ['x64', 'x86']) {
  const name = `Toolsiano_${version}_windows_${architecture}.exe`;
  const hash = createHash('sha256').update(await readFile(path.join(directory, name))).digest('hex');
  const expected = (await readFile(path.join(directory, name + '.sha256'), 'utf8')).trim().split(/\s+/)[0];
  if (hash !== expected) throw new Error(`Checksum mismatch: ${name}`);
  checksums.push(`${hash}  ${name}`);
}
const sourceName = 'toolsiano-source.zip';
const sourceHash = createHash('sha256').update(await readFile(path.join(directory, sourceName))).digest('hex');
checksums.push(`${sourceHash}  ${sourceName}`);
await writeFile(path.join(directory, 'SHA256SUMS.txt'), checksums.join('\n') + '\n');
const notes = `# Toolsiano ${version}\n\n## Русский\n\n${entry.changes.map(item => '- ' + item.ru).join('\n')}\n\nWindows 10/11 x64; Windows 10 x86. Установщики включают офлайн-установку WebView2. Обновление ручное, пользовательские файлы не отправляются на сервер.\n\n**Сборки не подписаны.** До публикации черновика проверьте установку, обновление и удаление в чистой Windows. SHA-256 не заменяет цифровую подпись. Не отключайте защиту ОС.\n\n## English\n\n${entry.changes.map(item => '- ' + item.en).join('\n')}\n\nWindows 10/11 x64; Windows 10 x86. Installers include the offline WebView2 installer. Updates are manual; user files are not uploaded.\n\n**Unsigned builds.** Before publishing this draft, test installation, upgrade and uninstall in a clean Windows environment. SHA-256 is not a code signature. Do not disable OS protection.\n\n## Source and licenses\n\nApplication: MIT. Third-party notices are bundled in the app and source archive. SHA256SUMS.txt covers installers and source.\n`;
await writeFile(path.join(directory, 'RELEASE_NOTES.md'), notes);
console.log(`Prepared ${version}: verified two installers, source checksum and bilingual draft notes. Nothing published.`);
