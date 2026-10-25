import { test, expect } from '@playwright/test';
import { parseHTML } from 'linkedom';
import { tools } from '../../src/data/tools.ts';

const routes = [
  '',
  ...tools.map((t) => t.slug + '/'),
  'about/',
  'security/',
  'privacy/',
  'libraries/',
  'download/',
];
test('all indexable pages have unique metadata, static content and reciprocal language links', async ({
  request,
}) => {
  for (const lang of ['ru', 'en']) {
    const origin = lang === 'ru' ? 'https://toolsiano.ru' : 'https://toolsiano.com';
    const titles = new Set(),
      descriptions = new Set();
    for (const route of routes) {
      const url = '/' + lang + '/' + route;
      const response = await request.get(url);
      expect(response.status(), url).toBe(200);
      const { document } = parseHTML(await response.text());
      const title = document.querySelector('title')!.textContent!.trim();
      const description = document
        .querySelector('meta[name="description"]')!
        .getAttribute('content')!;
      expect(title.length).toBeGreaterThan(10);
      expect(description.length).toBeGreaterThan(30);
      expect(titles.has(title), url + ' duplicate title').toBe(false);
      expect(descriptions.has(description), url + ' duplicate description').toBe(false);
      titles.add(title);
      descriptions.add(description);
      expect(document.documentElement.lang).toBe(lang);
      expect(document.querySelectorAll('h1').length).toBe(1);
      expect(document.querySelector('main')!.textContent!.trim().length).toBeGreaterThan(100);
      expect(
        document.querySelector('meta[name="robots"]')?.getAttribute('content') || '',
      ).not.toContain('noindex');
      expect(document.querySelectorAll('link[rel="canonical"]').length).toBe(1);
      expect(document.querySelector('link[rel="canonical"]')!.getAttribute('href')).toBe(
        origin + url,
      );
      for (const [other, host] of [
        ['ru', 'https://toolsiano.ru'],
        ['en', 'https://toolsiano.com'],
        ['x-default', 'https://toolsiano.com'],
      ])
        expect(document.querySelector(`link[hreflang="${other}"]`)!.getAttribute('href')).toBe(
          host + '/' + (other === 'x-default' ? 'en' : other) + '/' + route,
        );
      if (lang === 'en') expect(title + description).not.toMatch(/[А-Яа-яЁё]/);
      for (const a of document.querySelectorAll('a[href]')) {
        const href = a.getAttribute('href')!;
        if (href.startsWith('/') && !href.startsWith('//'))
          expect((await request.get(href)).status(), url + ' → ' + href).toBe(200);
      }
    }
  }
});

test('404 keeps its error status and has a readable working button in both themes and languages', async ({
  page,
}) => {
  for (const lang of ['ru', 'en'])
    for (const theme of ['light', 'dark']) {
      await page.addInitScript((theme) => localStorage.setItem('toolsiano-theme', theme), theme);
      const response = await page.goto('/' + lang + '/does-not-exist/');
      expect(response!.status()).toBe(404);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const a = page.locator('.prose a.button');
      await expect(a).toHaveText(lang === 'ru' ? 'Открыть инструменты' : 'Browse tools');
      await expect(a).toHaveAttribute('href', '/' + lang + '/');
      const contrast = await a.evaluate((el) => {
        const style = getComputedStyle(el);
        const luminance = (color: string) => {
          const c = color
            .match(/[\d.]+/g)!
            .slice(0, 3)
            .map(Number)
            .map((n) => {
              n /= 255;
              return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
            });
          return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
        };
        const fg = luminance(style.color),
          bg = luminance(style.backgroundColor);
        return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
      });
      expect(contrast).toBeGreaterThanOrEqual(4.5);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        'content',
        'noindex, follow',
      );
      await expect(page.locator('link[rel="canonical"], link[hreflang]')).toHaveCount(0);
      if (lang === 'ru' && theme === 'dark')
        await page.screenshot({ path: 'outputs/404-dark-fixed.png' });
      await a.click();
      await expect(page).toHaveURL('/' + lang + '/');
    }
});

test('domain sitemaps, redirects and direct error URLs expose correct HTTP statuses', async ({
  request,
}) => {
  for (const host of ['toolsiano.ru', 'toolsiano.com']) {
    const lang = host.endsWith('.com') ? 'en' : 'ru';
    const headers = { Host: host };
    const root = await request.get('/', { headers, maxRedirects: 0 });
    expect(root.status()).toBe(302);
    expect(root.headers().location).toBe('/' + lang + '/');
    for (const [path, status, location] of [
      ['/pdf/', 301, '/' + lang + '/pdf/'],
      ['/tools/compressor/', 301, '/' + lang + '/file-compressor/'],
      ['/en/pdf/index.html', 301, '/en/pdf/'],
      ['/ru/index.html', 301, '/ru/'],
      ['/en/pdf', 308, '/en/pdf/'],
    ] as const) {
      const r = await request.get(path, { headers, maxRedirects: 0 });
      expect(r.status(), path).toBe(status);
      expect(r.headers().location).toBe(location);
    }
    for (const path of ['/404.html', '/en/404.html', '/ru/404.html', '/en/missing/']) {
      const r = await request.get(path, { headers });
      expect(r.status()).toBe(404);
      expect(await r.text()).toContain('noindex, follow');
    }
    expect((await request.get('/ru/seo/', { headers })).status()).toBe(410);
    const sitemap = await request.get('/sitemap.xml', { headers });
    expect(sitemap.status()).toBe(200);
    const xml = await sitemap.text();
    const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
    expect(urls.length).toBe(routes.length);
    expect(new Set(urls).size).toBe(routes.length);
    for (const route of routes)
      expect(urls).toContain('https://' + host + '/' + lang + '/' + route);
    expect(xml).not.toContain('404');
    const robots = await request.get('/robots.txt', { headers });
    expect(robots.status()).toBe(200);
    expect(await robots.text()).toContain('Sitemap: https://' + host + '/sitemap.xml');
  }
});
