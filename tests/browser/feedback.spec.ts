import { test, expect } from '@playwright/test';

test('feedback draft stays local and excludes input values, URL parameters and filenames', async ({ page }) => {
  for (const lang of ['ru', 'en']) {
    await page.goto(`/${lang}/qr/?private=DO-NOT-INCLUDE#secret`);
    await expect(page.locator('[data-tool]')).toHaveAttribute('data-ready', 'true');
    await page.locator('#qr-text').fill('PRIVATE-QR-CONTENT');
    const href = await page.locator('a[data-bug-report]').getAttribute('href');
    const url = new URL(href!);
    expect(url.pathname).toBe('anak.devel@gmail.com');
    expect(url.searchParams.get('subject')).toContain('Toolsiano');
    expect(url.searchParams.get('body')).toContain(lang === 'ru' ? 'Инструмент: Генератор QR-кодов' : 'Tool: QR code generator');
    expect(decodeURIComponent(href!)).not.toMatch(/PRIVATE-QR|DO-NOT-INCLUDE|secret|private=/);
    await page.goto(`/${lang}/about/`);
    await expect(page.locator('main a[data-bug-report]')).toBeVisible();
    await expect(page.locator('#app-updates')).not.toBeVisible();
  }
});
