import { test, expect } from '@playwright/test';
import { isApplicationRequest } from './environment';

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
    await expect(page.locator('.download-notice strong')).toHaveText(
      lang === 'ru' ? 'Десктопные сборки готовятся' : 'Desktop builds are coming',
    );
    await expect(page.locator('.download-card')).toHaveCount(3);
    await expect(page.locator('a[href*="/releases/download/"]')).toHaveCount(0);
    await expect(page.locator('#language-switch')).toHaveAttribute(
      'href',
      `/${lang === 'ru' ? 'en' : 'ru'}/download/`,
    );
    if (lang === 'en') expect(await page.locator('main').innerText()).not.toMatch(/[А-Яа-яЁё]/);
    await page.locator('.download-card summary').first().click();
    await expect(page.locator('.download-card details').first()).toHaveAttribute('open', '');
    for (const width of [390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
  }
  expect(external).toEqual([]);
});
