import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { avifDimensions } from '../../src/lib/editor-input';
import { isApplicationRequest } from './environment';

const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20"><rect width="20" height="20" fill="red"/></svg>';
async function start(page: Page) {
  await page.goto('/en/image-tools/');
  await expect(page.locator('[data-tool]')).toHaveAttribute('data-ready', 'true');
  await page
    .locator('#files')
    .setInputFiles({ name: 'source.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) });
  await expect(page.locator('#image-preview canvas')).toBeVisible();
}
async function download(page: Page) {
  const event = page.waitForEvent('download');
  await page.locator('#results a').first().click();
  const output = await event;
  return { name: output.suggestedFilename(), bytes: await readFile((await output.path())!) };
}
async function pixel(page: Page, bytes: Buffer, type: string, x: number) {
  return page.evaluate(
    async ({ data, type, x }) => {
      const image = new Image();
      image.src = 'data:' + type + ';base64,' + data;
      await image.decode();
      const c = document.createElement('canvas');
      c.width = image.naturalWidth;
      c.height = image.naturalHeight;
      c.getContext('2d')!.drawImage(image, 0, 0);
      return [...c.getContext('2d')!.getImageData(x, 10, 1, 1).data];
    },
    { data: bytes.toString('base64'), type, x },
  );
}
test('exports actual AVIF with alpha using same-origin WASM and reopens its own SVG container', async ({
  page,
}) => {
  const outside: string[] = [];
  page.on('request', (r) => {
    if (isApplicationRequest(r.url()) && new URL(r.url()).hostname !== '127.0.0.1')
      outside.push(r.url());
  });
  await start(page);
  await page.locator('#image-format').selectOption('image/avif');
  await expect(page.locator('#image-format-note')).toContainText('encoded locally');
  await page.locator('#process').click();
  await expect(page.locator('#results a')).toHaveCount(1);
  const avif = await download(page);
  expect(avif.name).toMatch(/\.avif$/);
  expect(avif.bytes.subarray(4, 8).toString()).toBe('ftyp');
  expect(await avifDimensions(new Blob([avif.bytes]))).toEqual([40, 20]);
  // Reopen through the application's decoder: native AVIF is absent in some WebKit builds.
  await page.locator('#files').setInputFiles({ name: 'exported.avif', mimeType: 'image/avif', buffer: avif.bytes });
  await expect(page.locator('#image-preview canvas')).toBeVisible();
  await page.locator('#image-format').selectOption('image/png');
  await page.locator('#process').click();
  const reopened = await download(page);
  expect((await pixel(page, reopened.bytes, 'image/png', 5))[0]).toBeGreaterThan(180);
  expect((await pixel(page, reopened.bytes, 'image/png', 35))[3]).toBe(0);
  await page.locator('#files').setInputFiles({ name: 'source.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) });
  await page.locator('#image-format').selectOption('image/svg+xml');
  await expect(page.locator('#image-quality')).toBeDisabled();
  await expect(page.locator('#image-format-note')).toContainText('not vectorization');
  await page.locator('#process').click();
  await expect(page.locator('#results a')).toHaveCount(1);
  const exported = await download(page);
  expect(exported.name).toMatch(/\.svg$/);
  expect(exported.bytes.toString()).toContain('data:image/png;base64,');
  expect(exported.bytes.toString()).not.toMatch(/script|https?:\/\/(?!www.w3.org)/);
  expect((await pixel(page, exported.bytes, 'image/svg+xml', 35))[3]).toBe(0);
  await page
    .locator('#files')
    .setInputFiles({ name: 'roundtrip.svg', mimeType: 'image/svg+xml', buffer: exported.bytes });
  await expect(page.locator('#image-preview canvas')).toBeVisible();
  await page.locator('#image-format').selectOption('image/png');
  await page.locator('#process').click();
  await expect(page.locator('#results a')).toHaveCount(1);
  const png = await download(page);
  expect(await pixel(page, png.bytes, 'image/png', 5)).toEqual([255, 0, 0, 255]);
  expect(outside).toEqual([]);
});
test('AVIF limits are enforced before encoding and a pending codec can be cancelled', async ({
  page,
}) => {
  await start(page);
  await page.locator('#image-format').selectOption('image/avif');
  await page.locator('#image-ratio').uncheck();
  await page.locator('#image-width').fill('3000');
  await page.locator('#image-height').fill('1500');
  await page.locator('#process').click();
  await expect(page.locator('#tool-status')).toContainText('Reduce the image size for AVIF');
  await expect(page.locator('#results a')).toHaveCount(0);
  await page.locator('#image-width').fill('40');
  await page.locator('#image-height').fill('20');
  await page.route('**/*.wasm', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue().catch(() => {});
  });
  await page.locator('#process').click();
  await expect(page.locator('#tool-status')).toContainText('Encoding AVIF');
  await page.locator('#cancel-job').click();
  await expect(page.locator('#process')).toBeEnabled();
  await expect(page.locator('#results a')).toHaveCount(0);
});
test('offline copy includes the AVIF worker and codec', async ({ page, context }) => {
  await start(page);
  await page.locator('#offline-install').click();
  await page.locator('#offline-save').click();
  await expect(page.locator('#offline-state')).toContainText('saved in this browser', {
    timeout: 30000,
  });
  await page.locator('#offline-close').click();
  await context.setOffline(true);
  await start(page);
  await page.locator('#image-format').selectOption('image/avif');
  await page.locator('#process').click();
  await expect(page.locator('#results a')).toHaveCount(1);
  const output = await download(page);
  expect(output.bytes.subarray(4, 8).toString()).toBe('ftyp');
  await context.setOffline(false);
});
