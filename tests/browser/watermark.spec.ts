import { test, expect, type Page } from '@playwright/test';
import { PDFDocument, StandardFonts, degrees, PDFName, PDFDict } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import { isApplicationRequest } from './environment.ts';

async function visit(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('[data-tool]')).toHaveAttribute('data-ready', 'true');
}
async function png(page: Page, w: number, h: number, color: string) {
  const base64 = await page.evaluate(
    ({ w, h, color }) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, w, h);
      return c.toDataURL().split(',')[1];
    },
    { w, h, color },
  );
  return { name: 'private-logo.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') };
}
async function download(page: Page, index = 0) {
  const wait = page.waitForEvent('download');
  await page.locator('#results a').nth(index).click();
  return readFile((await (await wait).path())!);
}
async function bounds(page: Page, bytes?: Buffer, selector?: string) {
  return page.evaluate(
    async ({ base64, selector }) => {
      let c: HTMLCanvasElement;
      if (selector) c = document.querySelector(selector)!;
      else {
        const image = new Image();
        image.src = 'data:image/png;base64,' + base64;
        await image.decode();
        c = document.createElement('canvas');
        c.width = image.width;
        c.height = image.height;
        c.getContext('2d')!.drawImage(image, 0, 0);
      }
      const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let x0 = c.width,
        y0 = c.height,
        x1 = -1,
        y1 = -1,
        count = 0;
      for (let y = 0; y < c.height; y++)
        for (let x = 0; x < c.width; x++) {
          const i = (y * c.width + x) * 4;
          if (data[i] > 220 && data[i + 1] < 35 && data[i + 2] < 35 && data[i + 3] > 200) {
            x0 = Math.min(x0, x);
            y0 = Math.min(y0, y);
            x1 = Math.max(x1, x);
            y1 = Math.max(y1, y);
            count++;
          }
        }
      return { x0: x0 / c.width, y0: y0 / c.height, x1: x1 / c.width, y1: y1 / c.height, count };
    },
    { base64: bytes?.toString('base64'), selector },
  );
}

test('image logos: live preview, batch export, placement, rotation, tiling and local-only processing', async ({
  page,
}) => {
  const sent: string[] = [];
  page.on('request', (r) => {
    if (
      isApplicationRequest(r.url()) &&
      (r.method() !== 'GET' || new URL(r.url()).hostname !== '127.0.0.1')
    )
      sent.push(r.url());
  });
  await visit(page, '/en/image-tools/');
  const source = await png(page, 400, 300, '#fff'),
    logo = await png(page, 40, 20, '#f00');
  await page.locator('#files').setInputFiles([source, { ...source, name: 'second.png' }]);
  await page.locator('#image-format').selectOption('image/png');
  await page.locator('#wm-type').selectOption('image');
  await page.locator('#wm-file').setInputFiles(logo);
  await expect(page.locator('#wm-file-name')).toHaveText(logo.name);
  await page.locator('#wm-opacity').fill('100');
  await page.locator('#wm-size').fill('30');
  await page.locator('#wm-position').selectOption('0-0');
  const preview = await bounds(page, undefined, '#image-preview canvas');
  expect(preview.count).toBeGreaterThan(1000);
  expect(preview.x0).toBeLessThan(0.05);
  await page.locator('#process').click();
  await expect(page.locator('#results a')).toHaveCount(2);
  for (let i = 0; i < 2; i++) {
    const out = await bounds(page, await download(page, i));
    expect(out.x0).toBeCloseTo(preview.x0, 2);
    expect(out.y0).toBeCloseTo(preview.y0, 2);
  }
  await page.locator('#wm-position').selectOption('2-2');
  await page.locator('#wm-angle').fill('45');
  const rotated = await bounds(page, undefined, '#image-preview canvas');
  expect(rotated.x0).toBeGreaterThan(0.6);
  expect(rotated.y0).toBeGreaterThan(0.5);
  await page.locator('#wm-repeat').check();
  const tiled = await bounds(page, undefined, '#image-preview canvas');
  expect(tiled.x0).toBeLessThan(0.2);
  expect(tiled.y0).toBeLessThan(0.2);
  expect(tiled.count).toBeGreaterThan(rotated.count);
  await page.screenshot({ path: 'outputs/watermark-images.png', fullPage: true });
  await page.locator('#wm-remove').click();
  expect((await bounds(page, undefined, '#image-preview canvas')).count).toBe(0);
  await page.locator('#process').click();
  await expect(page.locator('#tool-status')).toHaveText('Choose a logo first');
  await expect(page.locator('#results a')).toHaveCount(0);
  await page
    .locator('#wm-file')
    .setInputFiles({ name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
  await expect(page.locator('#tool-status')).toContainText('choose a PNG, JPEG or WebP');
  expect(sent).toEqual([]);
});

test('PDF logo reuses one image, respects rotated cropped pages, ranges and preserves text', async ({
  page,
}) => {
  await visit(page, '/en/pdf-watermark/');
  const logo = await png(page, 40, 20, '#f00');
  const doc = await PDFDocument.create(),
    font = await doc.embedFont(StandardFonts.Helvetica);
  for (const angle of [0, 90, 180, 270]) {
    const p = doc.addPage([360, 460]);
    p.setCropBox(20, 30, 300, 400);
    p.setRotation(degrees(angle));
    p.drawText('Original private text', { x: 40, y: 250, size: 12, font });
  }
  await page.locator('#files').setInputFiles({
    name: 'private.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await doc.save()),
  });
  await page.locator('#wm-type').selectOption('image');
  await page.locator('#wm-file').setInputFiles(logo);
  await expect(page.locator('#wm-file-name')).toHaveText(logo.name);
  await page.locator('#wm-opacity').fill('100');
  await page.locator('#wm-position').selectOption('0-0');
  await page.locator('#wm-angle').fill('25');
  await page.locator('#mark-range').fill('1-4');
  await page.locator('#mark-preview-button').click();
  await expect(page.locator('#mark-preview canvas')).toBeVisible();
  const preview = await bounds(page, undefined, '#mark-preview canvas');
  expect(preview.count).toBeGreaterThan(100);
  await page.screenshot({ path: 'outputs/watermark-pdf.png', fullPage: true });
  await page.locator('#process').click();
  const output = await download(page);
  const saved = await PDFDocument.load(output);
  const refs = saved.getPages().map((p) => {
    const x = p.node.Resources()!.lookup(PDFName.of('XObject'), PDFDict);
    return x.values()[0].toString();
  });
  expect(new Set(refs).size).toBe(1);
  await page.locator('#mark-range').fill('2');
  await page.locator('#wm-repeat').check();
  await page.locator('#process').click();
  const selected = await PDFDocument.load(await download(page));
  const imageCount = (i: number) =>
    selected.getPage(i).node.Resources()!.lookup(PDFName.of('XObject'), PDFDict).keys().length;
  expect(imageCount(0)).toBe(0);
  expect(imageCount(1)).toBeGreaterThan(0);
  expect(imageCount(2)).toBe(0);
  await visit(page, '/en/pdf-export/');
  await page
    .locator('#files')
    .setInputFiles({ name: 'watermarked.pdf', mimeType: 'application/pdf', buffer: output });
  await page.locator('#export-format').selectOption('image/png');
  for (let i = 1; i <= 4; i++) {
    await page.locator('#export-range').fill(String(i));
    await page.locator('#process').click();
    const b = await bounds(page, await download(page));
    expect(b.count).toBeGreaterThan(100);
    expect(b.x0).toBeLessThan(0.06);
    expect(b.y0).toBeLessThan(0.06);
    if (i === 1) {
      expect(b.x1).toBeCloseTo(preview.x1, 1);
      expect(b.y1).toBeCloseTo(preview.y1, 1);
    }
  }
  await page.locator('#export-format').selectOption('text');
  await page.locator('#process').click();
  expect((await download(page)).toString()).toContain('Original private text');
});

test('Russian text marks and oversized logos validate, and mobile controls fit', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await visit(page, '/ru/image-tools/');
  const source = await png(page, 400, 300, '#fff');
  await page.locator('#files').setInputFiles(source);
  await page.locator('#wm-type').selectOption('text');
  await page.locator('#watermark').fill('Моя фотография');
  await page.locator('#wm-color').fill('#ff0000');
  await page.locator('#wm-opacity').fill('100');
  expect((await bounds(page, undefined, '#image-preview canvas')).count).toBeGreaterThan(10);
  await page.locator('#process').click();
  await expect(page.locator('#results a')).toHaveCount(1);
  await page.locator('#wm-type').selectOption('image');
  await page.locator('#wm-file').setInputFiles(await png(page, 2000, 1100, '#f00'));
  await expect(page.locator('#tool-status')).toContainText('не больше 2 мегапикселей');
  await page.locator('#wm-file').setInputFiles({
    name: 'large.png',
    mimeType: 'image/png',
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
  });
  await expect(page.locator('#tool-status')).toContainText('до 5 МБ');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'outputs/watermark-mobile.png', fullPage: true });
});
