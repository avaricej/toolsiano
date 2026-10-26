import { spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir, readdir, cp, rm } from 'node:fs/promises';
import path from 'node:path';
import { parseHTML } from 'linkedom';
import { preferredDesktopLocale } from '../src/lib/runtime.ts';
import { createHash } from 'node:crypto';
import { nativeLicenses } from './native-licenses.mjs';
import { simplifyDesktop } from './desktop-layout.mjs';
const root = path.resolve(import.meta.dirname, '..');
const work = path.join(root, 'work');
const output = path.join(work, 'desktop-dist');
const webOutput = path.join(work, 'desktop-web-dist');
if (!output.startsWith(work + path.sep)) throw new Error('Desktop output must stay inside work');
const notices = await nativeLicenses(root);
for (const args of [
  ['scripts/astro.mjs', 'build', '--outDir', webOutput],
  ['scripts/finalize.mjs'],
]) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1', TOOLSIANO_DIST: webOutput },
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await writeFile(path.join(output, 'native-licenses.txt'), notices);
for (const name of [
  'en',
  'ru',
  '_astro',
  'icons',
  'favicon.svg',
  'theme.js',
  'desktop.css',
  'desktop-preferences.js',
  'toolsiano-source.zip',
  'third-party-licenses.txt',
  'build-info.json',
])
  await cp(path.join(webOutput, name), path.join(output, name), { recursive: true });

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(file);
      continue;
    }
    if (!entry.name.endsWith('.html')) continue;
    const { document } = parseHTML(await readFile(file, 'utf8'));
    const en = document.documentElement.lang === 'en';
    document.documentElement.dataset.runtime = 'desktop';
    simplifyDesktop(document, process.env.TOOLSIANO_DESKTOP_ARCH || 'x64');
    for (const node of document.querySelectorAll(
      'link[rel="manifest"],link[rel="canonical"],link[hreflang],#offline-dialog,#offline-install,a[href$="/download/"]',
    ))
      node.remove();
    const local = document.querySelector('.local-pill');
    if (local) local.textContent = en ? 'Offline desktop app' : 'Офлайн-приложение';
    const footnote = document.querySelector('.footnote');
    if (footnote)
      footnote.textContent = en
        ? 'All tools and libraries are included. No internet connection is needed to process files.'
        : 'Все инструменты и библиотеки включены. Для обработки файлов интернет не нужен.';
    const replaceText = (node) => {
      if (node.nodeType === 3)
        node.textContent = node.textContent
          .replaceAll('Локально в браузере', 'Локально на устройстве')
          .replaceAll('в браузере', 'в приложении')
          .replaceAll('in the browser', 'in the app')
          .replaceAll('Работает офлайн*', 'Работает офлайн')
          .replaceAll('Works offline*', 'Works offline');
      else if (!['SCRIPT', 'STYLE'].includes(node.nodeName))
        for (const child of [...node.childNodes]) replaceText(child);
    };
    replaceText(document.body);
    if (file.endsWith(path.join('libraries', 'index.html'))) {
      const paragraph = document.createElement('p');
      const link = document.createElement('a');
      link.href = '/native-licenses.txt';
      link.setAttribute('download', 'toolsiano-native-licenses.txt');
      link.textContent = en
        ? 'Native dependency licenses (Rust / Tauri)'
        : 'Лицензии нативных зависимостей (Rust / Tauri)';
      paragraph.append(link);
      document.querySelector('main article').append(paragraph);
    }
    if (file.endsWith(path.join('privacy', 'index.html'))) {
      document.querySelector('main').innerHTML = en
        ? `<article class="prose"><h1>Desktop privacy</h1><p>Images, PDFs, passwords and QR codes are processed locally. No usage analytics, installation identifiers, automatic updates or file uploads are included.</p><h2>Local storage</h2><p>Your theme and language preferences are saved locally. The navigation layout is kept only for the current app session. Inputs and results stay in memory until you leave the page or close the app. Files you save remain on your disk.</p><h2>File access</h2><p>You choose inputs using the system file picker or drag and drop. Saving a result requires choosing a file in the native save dialog. The app does not have general filesystem read permission.</p><h2>Network</h2><p>The app loads its pages and libraries from the installed package. Clicking an external HTTPS link opens your system browser; the destination service then processes network data under its own policy. There are no background update checks.</p><h2>Downloads</h2><p>GitHub may count installer downloads. These counts do not measure app usage, unique users or installations.</p><h2>Limits</h2><p>Local processing does not protect against malware, compromised operating systems or malicious extensions. Clipboard contents and saved files are controlled by your operating system.</p><a href="/en/libraries/">Libraries and source code</a></article>`
        : `<article class="prose"><h1>Приватность приложения</h1><p>Изображения, PDF, пароли и QR-коды обрабатываются локально. Аналитики использования, идентификаторов установки, автоматических обновлений и отправки файлов нет.</p><h2>Локальное хранение</h2><p>Тема и язык интерфейса сохраняются локально. Вид навигации запоминается только на текущий сеанс приложения. Исходные данные и результаты находятся в памяти до перехода на другую страницу или закрытия приложения. Сохранённые файлы остаются на вашем диске.</p><h2>Доступ к файлам</h2><p>Вы выбираете исходные файлы через системное окно или перетаскиванием. Для сохранения результата нужно выбрать файл в системном диалоге. Общего разрешения на чтение файловой системы у приложения нет.</p><h2>Сеть</h2><p>Страницы и библиотеки загружаются из установленного пакета. Внешняя HTTPS-ссылка открывается в системном браузере, после чего действуют правила обработки сетевых данных соответствующего сервиса. Фоновых проверок обновлений нет.</p><h2>Скачивания</h2><p>GitHub может учитывать скачивания установщиков. Это не статистика использования приложения, уникальных людей или установок.</p><h2>Ограничения</h2><p>Локальная обработка не защищает от вредоносных программ и скомпрометированной операционной системы. Буфер обмена и сохранённые файлы находятся под управлением вашей системы.</p><a href="/ru/libraries/">Библиотеки и исходный код</a></article>`;
    }
    for (const anchor of document.querySelectorAll('a[href]')) {
      const href = anchor.getAttribute('href');
      if (href.startsWith('/') && href.endsWith('/'))
        anchor.setAttribute('href', href + 'index.html');
    }
    await writeFile(file, '<!doctype html>\n' + document.documentElement.outerHTML);
  }
}
await walk(output);
const choose = preferredDesktopLocale.toString();
await writeFile(
  path.join(output, 'desktop-start.js'),
  `let saved=null;try{saved=localStorage.getItem('toolsiano-language')}catch{};const choose=${choose};const lang=choose(saved,navigator.language,window.__TOOLSIANO_INSTALLER_LANGUAGE__||null);try{localStorage.setItem('toolsiano-language',lang)}catch{};location.replace('/'+lang+'/index.html');`,
);
await writeFile(
  path.join(output, 'index.html'),
  '<!doctype html><html lang="en" data-runtime="desktop"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Toolsiano</title><script src="/desktop-start.js" defer></script></head><body><a href="/en/index.html">English</a> · <a href="/ru/index.html">Русский</a></body></html>',
);
const files = {};
async function hashFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await hashFiles(file);
    else if (entry.name !== 'build-info.json')
      files[path.relative(output, file).replaceAll('\\', '/')] = createHash('sha256')
        .update(await readFile(file))
        .digest('hex');
  }
}
await hashFiles(output);
const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
await writeFile(
  path.join(output, 'build-info.json'),
  JSON.stringify(
    {
      version,
      runtime: 'desktop',
      release: createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0, 16),
      files,
    },
    null,
    2,
  ),
);
console.log(
  'Desktop frontend ready: work/desktop-dist (both languages, no service worker or web download UI).',
);
