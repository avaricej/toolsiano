import { test, expect, type Page, type Download } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import QRCode from 'qrcode';
import { isApplicationRequest } from './environment.ts';
test.beforeEach(async ({ page }) => {
  const unexpected: string[] = [];
  page.on('request', (r) => {
    if (!isApplicationRequest(r.url())) return;
    const host = new URL(r.url()).hostname;
    if (host === 'gc.kis.v2.scr.kaspersky-labs.com') return;
    if (
      host !== '127.0.0.1' ||
      r.method() !== 'GET' ||
      /private-document|private-photo|PRIVATE-QR/.test(r.url())
    )
      unexpected.push(r.method() + ' ' + r.url());
  });
  (page as any).__unexpected = unexpected;
});
test.afterEach(async ({ page }) => expect((page as any).__unexpected).toEqual([]));
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==',
  'base64',
);
async function visit(page: Page, path: string) {
  await page.goto(path);
  if (await page.locator('[data-tool]').count())
    await expect(page.locator('[data-tool]')).toHaveAttribute('data-ready', 'true');
}
async function resultBytes(page: Page) {
  await expect(page.locator('#results a')).toHaveCount(1);
  const wait = page.waitForEvent('download');
  await page.locator('#results a').click();
  const file = await (await wait).path();
  return readFile(file!);
}
async function pdfFile() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 3; i++)
    pdf.addPage([300, 400]).drawText('Private text page ' + i, { x: 30, y: 350, size: 14, font });
  return {
    name: 'private-document.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await pdf.save()),
  };
}
test('language selection keeps the tool, domain defaults redirect, removed tools are gone', async ({
  page,
  request,
}) => {
  await visit(page, '/ru/qr/');
  await page.locator('#language-switch').click();
  await expect(page).toHaveURL(/\/en\/qr\/$/);
  await expect(page.locator('h1')).toHaveText('QR code generator');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
    'href',
    'https://toolsiano.com/en/qr/',
  );
  await page.locator('#language-switch').click();
  await expect(page).toHaveURL(/\/ru\/qr\/$/);
  for (const [host, locale] of [
    ['toolsiano.com', 'en'],
    ['toolsiano.ru', 'ru'],
  ]) {
    const response = await request.get('/', { headers: { Host: host }, maxRedirects: 0 });
    expect(response.status()).toBe(302);
    expect(response.headers().location).toBe('/' + locale + '/');
  }
  for (const slug of ['pomodoro', 'format', 'seo', 'diary', 'loto']) {
    expect((await request.get('/en/' + slug + '/')).status()).toBe(410);
  }
  await visit(page, '/en/');
  await expect(page.locator('.tool-card')).toHaveCount(11);
  await page.getByRole('button', { name: 'Images', exact: true }).click();
  await expect(page.locator('.tool-card:visible')).toHaveCount(3);
  expect(await page.locator('main').innerText()).not.toMatch(/[А-Яа-яЁё]/);
});
test('batch image editor creates separate results, comparison and ZIP', async ({ page }) => {
  await visit(page, '/en/image-tools/');
  await page.locator('#files').setInputFiles([
    { name: 'first.png', mimeType: 'image/png', buffer: png },
    { name: 'second.png', mimeType: 'image/png', buffer: png },
  ]);
  await page.getByRole('button', { name: 'Process images', exact: true }).click();
  await expect(page.locator('#results a')).toHaveCount(2);
  await expect(page.locator('#tool-status')).toContainText('Files completed: 2 of 2.');
  await page.locator('#image-compare').check();
  await expect(page.locator('#image-preview canvas')).toHaveCount(1);
  const wait = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download results ZIP' }).click();
  expect((await wait).suggestedFilename()).toBe('toolsiano-results.zip');
  await page.getByRole('button', { name: 'Clear results', exact: true }).click();
  await expect(page.locator('#results a')).toHaveCount(0);
});
test('PDF page ranges and export images/text are local', async ({ page }) => {
  await visit(page, '/en/page-replacer/');
  await page.locator('#files').setInputFiles(await pdfFile());
  await expect(page.locator('.page-tile')).toHaveCount(3);
  await page.locator('#page-range').fill('3, 1');
  await page.getByRole('button', { name: 'Save selected pages', exact: true }).click();
  const out = await PDFDocument.load(await resultBytes(page));
  expect(out.getPageCount()).toBe(2);
  await visit(page, '/en/pdf-export/');
  await page.locator('#files').setInputFiles(await pdfFile());
  await page.locator('#export-range').fill('2');
  await page.getByRole('button', { name: 'Export pages' }).click();
  expect((await resultBytes(page)).subarray(0, 2)).toEqual(Buffer.from([255, 216]));
  await page.locator('#export-format').selectOption('text');
  await page.getByRole('button', { name: 'Export pages' }).click();
  expect((await resultBytes(page)).toString()).toContain('Private text page 2');
});
test('QR reader displays data without opening links; scan and watermark export files', async ({
  page,
}) => {
  await visit(page, '/en/qr-reader/');
  await page.locator('#files').setInputFiles({
    name: 'code.png',
    mimeType: 'image/png',
    buffer: await QRCode.toBuffer('https://example.invalid/private'),
  });
  await page.getByRole('button', { name: 'Read QR code', exact: true }).click();
  await expect(page.locator('#qr-decoded')).toHaveValue('https://example.invalid/private');
  await expect(page).toHaveURL(/qr-reader/);
  await visit(page, '/en/scan-tools/');
  await page
    .locator('#files')
    .setInputFiles({ name: 'scan.png', mimeType: 'image/png', buffer: png });
  await page.getByRole('button', { name: 'Clean up scan', exact: true }).click();
  await expect(page.locator('#results a')).toHaveCount(1);
  await visit(page, '/en/pdf-watermark/');
  await page.locator('#files').setInputFiles(await pdfFile());
  await page.locator('#watermark').fill('Копия для получателя');
  await page.locator('#mark-range').fill('1–2');
  await page.getByRole('button', { name: 'Add watermark', exact: true }).click();
  expect((await PDFDocument.load(await resultBytes(page))).getPageCount()).toBe(3);
});
test('target size, resource rejection and English errors', async ({ page }) => {
  await visit(page, '/en/file-compressor/');
  await page
    .locator('#files')
    .setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: png });
  await page.locator('#target-kb').fill('10');
  await page.getByRole('button', { name: 'Process files' }).click();
  expect((await resultBytes(page)).length).toBeLessThanOrEqual(10 * 1024);
  await visit(page, '/en/pdf-export/');
  await page.locator('#files').setInputFiles(await pdfFile());
  await page.locator('#export-range').fill('900');
  await page.getByRole('button', { name: 'Export pages' }).click();
  await expect(page.locator('#tool-status')).toHaveText('Page number is outside the document');
});
test('English offline copy supports language switching and new tool modules', async ({
  page,
  context,
}) => {
  await visit(page, '/en/');
  await page.locator('#offline-install').click();
  await page.locator('#offline-save').click();
  await expect(page.locator('#toast')).toContainText('The offline copy is saved', {
    timeout: 60000,
  });
  await page.reload();
  await context.setOffline(true);
  await visit(page, '/en/scan-tools/');
  await page
    .locator('#files')
    .setInputFiles({ name: 'offline.png', mimeType: 'image/png', buffer: png });
  await page.getByRole('button', { name: 'Clean up scan', exact: true }).click();
  await expect(page.locator('#results a')).toHaveCount(1);
  await page.locator('#language-switch').click();
  await expect(page).toHaveURL(/\/ru\/scan-tools\//);
  await expect(page.locator('h1')).toHaveText('Подготовка сканов');
  await context.setOffline(false);
});
