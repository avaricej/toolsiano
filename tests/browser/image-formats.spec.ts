import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { isApplicationRequest } from './environment';

const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20"><style>.green{fill:#00ff00}</style><rect class="green" width="20" height="20"/></svg>';
async function visit(page: Page, lang = 'en') {
  await page.goto('/' + lang + '/image-tools/');
  await expect(page.locator('[data-tool]')).toHaveAttribute('data-ready', 'true');
}
async function inspect(page: Page, bytes: Buffer, type: string, x: number, y: number) {
  return page.evaluate(
    async ({ data, type, x, y }) => {
      const image = new Image();
      image.src = 'data:' + type + ';base64,' + data;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext('2d')!.drawImage(image, 0, 0);
      return {
        width: canvas.width,
        height: canvas.height,
        pixel: [...canvas.getContext('2d')!.getImageData(x, y, 1, 1).data],
      };
    },
    { data: bytes.toString('base64'), type, x, y },
  );
}
async function download(page: Page, index = 0) {
  const event = page.waitForEvent('download');
  await page.locator('#results a').nth(index).click();
  const result = await event;
  return { name: result.suggestedFilename(), bytes: await readFile((await result.path())!) };
}

test('AVIF and SVG batch conversion preserves real pixels, dimensions and PNG transparency', async ({
  page,
}) => {
  const external: string[] = [];
  page.on('request', (request) => {
    if (isApplicationRequest(request.url()) && new URL(request.url()).hostname !== '127.0.0.1')
      external.push(request.url());
  });
  await visit(page);
  await page.locator('#files').setInputFiles([
    {
      name: 'private-photo.avif',
      mimeType: 'image/avif',
      buffer: await readFile(new URL('../fixtures/editor-sample.avif', import.meta.url)),
    },
    { name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) },
  ]);
  await expect(page.locator('#image-preview canvas')).toBeVisible();
  await page.locator('#image-format').selectOption('image/png');
  await page.locator('#image-width').fill('160');
  await page.locator('#process').click();
  await expect(page.locator('#results a')).toHaveCount(2);
  const avif = await download(page),
    converted = await download(page, 1);
  expect(avif.name).toMatch(/\.png$/);
  const photo = await inspect(page, avif.bytes, 'image/png', 50, 50);
  expect([photo.width, photo.height]).toEqual([160, 120]);
  expect(photo.pixel[0]).toBeGreaterThan(180);
  expect(photo.pixel[1]).toBeLessThan(60);
  const left = await inspect(page, converted.bytes, 'image/png', 20, 20);
  expect([left.width, left.height]).toEqual([160, 80]);
  expect(left.pixel).toEqual([0, 255, 0, 255]);
  expect((await inspect(page, converted.bytes, 'image/png', 140, 20)).pixel[3]).toBe(0);
  expect(external).toEqual([]);
});

test('SVG exports JPEG with a white background and WebP, with gradients and clipping', async ({
  page,
}) => {
  await visit(page, 'ru');
  const graphic =
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><defs><linearGradient id="color"><stop stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient><clipPath id="clip"><rect width="20" height="20"/></clipPath></defs><rect width="40" height="20" fill="url(#color)" clip-path="url(#clip)"/></svg>';
  await page.locator('#files').setInputFiles({
    name: 'gradient.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(graphic),
  });
  await expect(page.locator('#image-preview canvas')).toBeVisible();
  for (const type of ['image/jpeg', 'image/webp']) {
    await page.locator('#image-format').selectOption(type);
    await page.locator('#process').click();
    await expect(page.locator('#results a')).toHaveCount(1);
    const output = await download(page);
    const image = await inspect(page, output.bytes, type, 35, 10);
    expect([image.width, image.height]).toEqual([40, 20]);
    if (type === 'image/jpeg') {
      expect(output.bytes[0]).toBe(255);
      expect(image.pixel.slice(0, 3).every((value) => value > 240)).toBe(true);
    } else {
      expect(output.bytes.subarray(8, 12).toString()).toBe('WEBP');
      expect(image.pixel[3]).toBe(0);
    }
  }
  await page.locator('#image-format').selectOption('image/png');
  await page.locator('#image-background').selectOption('color');
  await page.locator('#image-background-color').fill('#123456');
  await page.locator('#process').click();
  await expect(page.locator('#results a')).toHaveCount(1);
  const colored = await download(page);
  expect((await inspect(page, colored.bytes, 'image/png', 35, 10)).pixel).toEqual([
    18, 52, 86, 255,
  ]);
});

test('SVG blocks active content and external resources before preview and rejects excessive dimensions', async ({
  page,
}) => {
  const external: string[] = [],
    errors: string[] = [];
  page.on('request', (request) => {
    if (isApplicationRequest(request.url()) && new URL(request.url()).hostname !== '127.0.0.1')
      external.push(request.url());
  });
  page.on('pageerror', (error) => {
    if (!error.stack?.includes('kaspersky-labs.com')) errors.push(error.message);
  });
  await visit(page);
  await page.evaluate(() => {
    (window as unknown as { svgExecuted: boolean }).svgExecuted = false;
  });
  const attacks = [
    '<script>window.svgExecuted=true</script>',
    '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">HTML</div></foreignObject>',
    '<image href="https://svg-unexpected.invalid/private"/>',
    '<style>@import url(https://svg-unexpected.invalid/style);</style>',
    '<rect width="20" height="20" fill="url(https://svg-unexpected.invalid/image)"/>',
    '<rect width="20" height="20" onload="window.svgExecuted=true"/>',
    '<use href="#loop" id="loop"/>',
  ];
  for (const content of attacks) {
    await page.locator('#files').setInputFiles({
      name: 'unsafe.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20">' + content + '</svg>',
      ),
    });
    await expect(page.locator('#tool-status')).toContainText('This SVG is not supported');
    await expect(page.locator('#image-preview canvas')).toHaveCount(0);
  }
  await page.locator('#files').setInputFiles({
    name: 'huge.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="50000" height="50000"/>'),
  });
  await expect(page.locator('#tool-status')).toContainText('too large');
  expect(
    await page.evaluate(() => (window as unknown as { svgExecuted: boolean }).svgExecuted),
  ).toBe(false);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test('the offline copy converts SVG and the metadata tool keeps its narrower format scope', async ({
  page,
  context,
}) => {
  await visit(page);
  await page.locator('#offline-install').click();
  await page.locator('#offline-save').click();
  await expect(page.locator('#offline-state')).toContainText('saved in this browser', {
    timeout: 30000,
  });
  await page.locator('#offline-close').click();
  await context.setOffline(true);
  await visit(page);
  await page
    .locator('#files')
    .setInputFiles({ name: 'offline.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) });
  await expect(page.locator('#image-preview canvas')).toBeVisible();
  await page.locator('#process').click();
  await expect(page.locator('#results a')).toHaveCount(1);
  await page.goto('/en/meta-remover/');
  await expect(page.locator('[data-tool]')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#files')).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
  await context.setOffline(false);
});
