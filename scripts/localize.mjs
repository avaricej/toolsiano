import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { parseHTML } from 'linkedom';
import { translate } from '../src/lib/i18n.ts';
export const origins = {
  en: process.env.PUBLIC_EN_ORIGIN || 'https://toolsiano.com',
  ru: process.env.PUBLIC_RU_ORIGIN || 'https://toolsiano.ru',
};
export async function localize(dist) {
  const pages = [];
  async function walk(dir) {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.name.endsWith('.html')) pages.push(p);
    }
  }
  await walk(dist);
  const missing = new Set();
  for (const file of pages) {
    const relative = path.relative(dist, file).replaceAll('\\', '/');
    const route =
      relative === 'index.html'
        ? '/'
        : relative === '404.html'
          ? '/404.html'
          : '/' + relative.slice(0, -10);
    const original = await readFile(file, 'utf8');
    for (const lang of ['ru', 'en']) {
      const { document } = parseHTML(original);
      document.documentElement.lang = lang;
      function localizeText(node) {
        if (node.nodeType === 3) {
          const before = node.textContent;
          if (/[А-Яа-яЁё]/.test(before)) {
            const after = translate(before, lang);
            if (lang === 'en' && /[А-Яа-яЁё]/.test(after))
              missing.add(before.replace(/\s+/g, ' ').trim());
            node.textContent =
              (before.match(/^\s*/)?.[0] || '') + after.trim() + (before.match(/\s*$/)?.[0] || '');
          }
          return;
        }
        if (node.nodeType !== 1 && node.nodeType !== 9) return;
        if (['SCRIPT', 'STYLE'].includes(node.nodeName)) return;
        for (const attr of [
          'aria-label',
          'placeholder',
          'title',
          'alt',
          'content',
          'data-filter',
          'data-category',
        ]) {
          const before = node.getAttribute?.(attr);
          if (before && /[А-Яа-яЁё]/.test(before)) {
            const after = translate(before, lang);
            if (lang === 'en' && /[А-Яа-яЁё]/.test(after))
              missing.add(before.replace(/\s+/g, ' ').trim());
            node.setAttribute(attr, after);
          }
        }
        for (const child of Array.from(node.childNodes || [])) localizeText(child);
      }
      localizeText(document);
      for (const a of document.querySelectorAll('a[href]')) {
        const href = a.getAttribute('href');
        if (href.startsWith('/') && !href.startsWith('//') && !/\.(zip|json|txt|svg)$/.test(href)) {
          a.setAttribute('href', '/' + lang + (href === '/' ? '/' : href));
        }
      }
      for (const card of document.querySelectorAll('.tool-card'))
        card.setAttribute('data-search', card.textContent.replace(/\s+/g, ' '));
      const toggle = document.getElementById('language-switch');
      if (toggle) {
        const other = lang === 'en' ? 'ru' : 'en';
        toggle.setAttribute('href', '/' + other + route);
        toggle.setAttribute('lang', other);
        toggle.setAttribute('hreflang', other);
        toggle.setAttribute(
          'aria-label',
          other === 'en' ? 'Switch to English' : 'Переключить на русский',
        );
        toggle.textContent = other.toUpperCase();
      }
      document
        .querySelector('link[rel="canonical"]')
        ?.setAttribute('href', origins[lang] + '/' + lang + route);
      if (!document.querySelector('meta[name="robots"][content*="noindex"]')) {
        for (const other of ['en', 'ru']) {
          const link = document.createElement('link');
          link.setAttribute('rel', 'alternate');
          link.setAttribute('hreflang', other);
          link.setAttribute('href', origins[other] + '/' + other + route);
          document.head.append(link);
        }
        const def = document.createElement('link');
        def.setAttribute('rel', 'alternate');
        def.setAttribute('hreflang', 'x-default');
        def.setAttribute('href', origins.en + '/en' + route);
        document.head.append(def);
      }
      document
        .querySelector('link[rel="manifest"]')
        ?.setAttribute('href', '/manifest-' + lang + '.webmanifest');
      const dest = path.join(dist, lang, relative);
      await mkdir(path.dirname(dest), { recursive: true });
      await writeFile(dest, '<!doctype html>\n' + document.documentElement.outerHTML);
    }
    const redirect =
      '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><script src="/language.js"></script><title>Toolsiano</title></head><body><a href="/en' +
      route +
      '">English</a> · <a href="/ru' +
      route +
      '">Русский</a></body></html>';
    await writeFile(file, redirect);
  }
  for (const lang of ['en', 'ru'])
    await writeFile(
      path.join(dist, 'manifest-' + lang + '.webmanifest'),
      JSON.stringify({
        id: '/' + lang + '/',
        name: 'Toolsiano',
        short_name: 'Toolsiano',
        lang,
        start_url: '/' + lang + '/',
        scope: '/',
        display: 'standalone',
        background_color: '#f7f9f8',
        theme_color: '#15745b',
        icons: [
          { src: '/icons/app-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/app-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icons/app-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      }),
    );
  await mkdir('work', { recursive: true });
  await writeFile('work/missing-translations.json', JSON.stringify([...missing], null, 2));
  if (missing.size)
    throw new Error(
      'Missing English translations: ' + missing.size + ' (work/missing-translations.json)',
    );
  return pages.length * 2;
}
