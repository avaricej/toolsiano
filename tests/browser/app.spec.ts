import { test, expect, type Page, type Download } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { isApplicationRequest } from './environment.ts';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==',
  'base64',
);
test('catalog filters, search, theme, responsive navigation', async ({ page }) => {
  await visit(page, '/');
  await expect(page.locator('.tool-card:visible')).toHaveCount(11);
  await page.getByRole('button', { name: 'Изображения', exact: true }).click();
  await expect(page.locator('.tool-card:visible')).toHaveCount(3);
  await page.getByRole('button', { name: 'Все инструменты', exact: true }).click();
  await page.getByRole('searchbox').fill('парол');
  await expect(page.locator('.tool-card:visible')).toHaveCount(1);
  await page.getByRole('combobox', { name: 'Тема оформления' }).selectOption('dark');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Открыть меню' }).click();
  await expect(page.locator('#sidebar')).toHaveClass(/open/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('password and QR do not transmit user data', async ({ page }) => {
  const requests: { url: string; method: string }[] = [];
  page.on('request', (r) => requests.push({ url: r.url(), method: r.method() }));
  await visit(page, '/password/');
  await expect(page.locator('#password-output')).not.toHaveValue('');
  await page.locator('#password-length').fill('32');
  await page.getByRole('button', { name: 'Новый пароль' }).click();
  expect((await page.locator('#password-output').inputValue()).length).toBe(32);
  await visit(page, '/qr/');
  await page.locator('#qr-text').fill('PRIVATE-QR-CONTENT');
  await page.getByRole('button', { name: 'Создать QR-код' }).click();
  await expect(page.locator('#qr-preview canvas')).toBeVisible();
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать SVG' }).click();
  expect((await dl).suggestedFilename()).toBe('toolsiano-qr.svg');
  expect(requests.every((r) => !r.url.includes('PRIVATE-QR'))).toBe(true);
  expect(
    requests.filter(
      (r) =>
        isApplicationRequest(r.url) &&
        (new URL(r.url).origin !== new URL(page.url()).origin || r.method !== 'GET'),
    ),
  ).toEqual([]);
});
test('images convert and metadata cleaning return actual PNG', async ({ page }) => {
  for (const route of ['/image-tools/', '/meta-remover/']) {
    await visit(page, route);
    await page
      .locator('#files')
      .setInputFiles({ name: 'sample.png', mimeType: 'image/png', buffer: png });
    if (route === '/image-tools/') await page.locator('#image-format').selectOption('image/png');
    await page
      .getByRole('button', {
        name: route === '/image-tools/' ? 'Обработать изображения' : 'Удалить метаданные',
        exact: true,
      })
      .click();
    await expect(page.locator('#results a')).toHaveCount(1);
    const dl = page.waitForEvent('download');
    await page.locator('#results a').click();
    const bytes = await readDownload(await dl);
    expect(Array.from(bytes.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  }
});
test('creates PDF locally and page editor reorders, rotates, exports', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (r) => {
    if (isApplicationRequest(r.url()) && r.method() !== 'GET') requests.push(r.url());
  });
  await visit(page, '/pdf/');
  await page.locator('#files').setInputFiles([
    { name: 'one.png', mimeType: 'image/png', buffer: png },
    { name: 'two.png', mimeType: 'image/png', buffer: png },
  ]);
  await page.getByRole('button', { name: 'Создать PDF', exact: true }).click();
  await expect(page.locator('#results a')).toHaveCount(1);
  const pdf = await PDFDocument.create();
  pdf.addPage([200, 300]);
  pdf.addPage([300, 400]);
  await visit(page, '/page-replacer/');
  await page.locator('#files').setInputFiles({
    name: 'two-pages.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await pdf.save()),
  });
  await expect(page.locator('.page-tile')).toHaveCount(2);
  await expect(page.locator('.page-tile canvas')).toHaveCount(2);
  await page.getByRole('button', { name: 'Повернуть на 90 градусов 1', exact: true }).click();
  await page.getByRole('button', { name: 'Сохранить выбранные страницы', exact: true }).click();
  await expect(page.locator('#results a')).toHaveCount(1);
  const dl = page.waitForEvent('download');
  await page.locator('#results a').click();
  const output = await PDFDocument.load(await readDownload(await dl));
  expect(output.getPageCount()).toBe(2);
  expect(output.getPage(0).getRotation().angle).toBe(90);
  expect(requests).toEqual([]);
});
test('compresses image, optimizes PDF, rasterizes PDF and creates ZIP', async ({ page }) => {
  const pdf = await PDFDocument.create();
  pdf.addPage([200, 200]);
  const file = {
    name: 'sample.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await pdf.save()),
  };
  for (const mode of ['image', 'pdf', 'render', 'zip']) {
    await visit(page, '/file-compressor/');
    await page.locator('#compress-mode').selectOption(mode);
    await page
      .locator('#files')
      .setInputFiles(
        mode === 'image' ? { name: 'photo.png', mimeType: 'image/png', buffer: png } : file,
      );
    await page.getByRole('button', { name: 'Обработать файлы' }).click();
    await expect(page.locator('#results a')).toHaveCount(1);
    await expect(page.locator('#tool-status')).not.toHaveClass(/error/);
  }
});
test('offline package supports fresh page navigation and lazy libraries', async ({
  page,
  context,
}) => {
  await visit(page, '/');
  await page.locator('#offline-install').click();
  await page.locator('#offline-save').click();
  await expect(page.locator('#toast')).toContainText('Офлайн-копия сохранена', { timeout: 60000 });
  await page.reload();
  await context.setOffline(true);
  await visit(page, '/qr/');
  await page.locator('#qr-text').fill('offline');
  await page.getByRole('button', { name: 'Создать QR-код' }).click();
  await expect(page.locator('#qr-preview canvas')).toBeVisible();
  await visit(page, '/pdf/');
  await page
    .locator('#files')
    .setInputFiles({ name: 'offline.png', mimeType: 'image/png', buffer: png });
  await page.getByRole('button', { name: 'Создать PDF', exact: true }).click();
  await expect(page.locator('#results a')).toHaveCount(1);
  await context.setOffline(false);
});

// This Windows machine injects Kaspersky's own browser integration. We distinguish
// that exact environment hostname from application requests; no security setting is changed.
async function visit(page: Page, path: string) {
  await page.goto('/ru' + path);
  if (await page.locator('[data-tool]').count())
    await expect(page.locator('[data-tool]')).toHaveAttribute('data-ready', 'true');
}
async function readDownload(download: Download) {
  const path = await download.path();
  if (!path) throw new Error('Download failed');
  return readFile(path);
}
