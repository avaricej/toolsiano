import { test, expect } from '@playwright/test';
import { isApplicationRequest } from './environment';
import { readFileSync } from 'node:fs';
import { validateDesktopCatalog } from '../../src/lib/desktop';

const latest = validateDesktopCatalog(
  JSON.parse(
    readFileSync(new URL('../../src/data/desktop-releases.json', import.meta.url), 'utf8'),
  ),
).releases[0];

test('download pages are localized, usable on mobile, and send no GitHub or analytics requests', async ({
  page,
}) => {
  const external: string[] = [];
  page.on('request', (request) => {
    if (isApplicationRequest(request.url()) && new URL(request.url()).hostname !== '127.0.0.1')
      external.push(request.url());
  });
  for (const lang of ['ru', 'en']) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/${lang}/download/`);
    await expect(page.locator('h1')).toHaveText(
      lang === 'ru' ? 'Скачать Toolsiano' : 'Download Toolsiano',
    );
    if (latest) {
      await expect(page.locator('.download-notice')).toHaveCount(0);
      await expect(page.locator('.download-page > p strong')).toHaveText(latest.tag);
      await expect(page.locator('.download-page > p time')).toHaveAttribute(
        'datetime',
        latest.date,
      );
    } else {
      await expect(page.locator('.download-notice strong')).toHaveText(
        lang === 'ru' ? 'Десктопные сборки готовятся' : 'Desktop builds are coming',
      );
    }
    await expect(page.locator('.download-card')).toHaveCount(3);
    await expect(page.locator('a[href*="/releases/download/"]')).toHaveCount(
      latest?.assets.length || 0,
    );
    for (const platform of ['windows', 'macos', 'linux']) {
      const card = page.locator(`.download-card[data-platform="${platform}"]`);
      const assets = latest?.assets.filter((asset) => asset.platform === platform) || [];
      await expect(card.locator('.download-asset')).toHaveCount(assets.length);
      await expect(card.locator('.download-status')).toHaveCount(assets.length ? 0 : 1);
      for (const [index, asset] of assets.entries()) {
        const item = card.locator('.download-asset').nth(index);
        await expect(item.locator('a.button')).toHaveAttribute('href', asset.url);
        await expect(item.locator('a.button')).toContainText(asset.architecture);
        await expect(item.locator('p')).toContainText(asset.name);
        await item.locator('summary').click();
        await expect(item.locator('code')).toBeVisible();
        await expect(item.locator('code')).toHaveText(asset.sha256);
      }
    }
    await expect(page.locator('#language-switch')).toHaveAttribute(
      'href',
      `/${lang === 'ru' ? 'en' : 'ru'}/download/`,
    );
    if (lang === 'en') expect(await page.locator('main').innerText()).not.toMatch(/[А-Яа-яЁё]/);
    const installation = page.locator('.download-card').first().locator(':scope > details');
    await installation.locator('summary').click();
    await expect(installation).toHaveAttribute('open', '');
    for (const width of [390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
  }
  expect(external).toEqual([]);
});
