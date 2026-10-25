import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test('all tools fit mobile screens and render without application exceptions', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    if (!error.stack?.includes('kaspersky-labs.com')) errors.push(error.message);
  });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const slug of [
    'image-tools',
    'pdf',
    'page-replacer',
    'file-compressor',
    'meta-remover',
    'password',
    'qr',
    'pdf-export',
    'scan-tools',
    'qr-reader',
    'pdf-watermark',
  ]) {
    await page.goto('/en/' + slug + '/');
    await expect(page.locator('[data-tool]')).toHaveAttribute('data-ready', 'true');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      slug,
    ).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('desktop and mobile visual review captures', async ({ page }) => {
  await mkdir('outputs', { recursive: true });
  await page.addInitScript(() => localStorage.setItem('toolsiano-theme', 'light'));
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.goto('/en/');
  await page.screenshot({ path: 'outputs/preview-desktop.png' });
  await page.goto('/en/password/');
  await expect(page.locator('[data-tool]')).toHaveAttribute('data-ready', 'true');
  await page.screenshot({ path: 'outputs/preview-tool.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/en/');
  await page.screenshot({ path: 'outputs/preview-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await page.screenshot({ path: 'outputs/preview-dark.png' });
});
