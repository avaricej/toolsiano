import { test, expect } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

test('real JPEG variants retain orientation and colors; metadata cleanup preserves orientation', async ({ page }) => {
  await page.goto('/en/image-tools/');
  await expect(page.locator('[data-tool]')).toHaveAttribute('data-ready', 'true');
  await page.locator('#files').setInputFiles(['tests/fixtures/orientation-6.jpg', 'tests/fixtures/progressive.jpg', 'tests/fixtures/cmyk.jpg']);
  await page.locator('#image-format').selectOption('image/png');
  await page.locator('#process').click();
  await expect(page.locator('#results a')).toHaveCount(3);
  const outputs = await page.locator('#results a').evaluateAll(async links => Promise.all(links.map(async link => {
    const image = new Image(); image.src = (link as HTMLAnchorElement).href; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
    return { width: image.width, height: image.height,
      first: [...ctx.getImageData(20, 20, 1, 1).data],
      last: [...ctx.getImageData(image.width - 20, image.height - 20, 1, 1).data] };
  })));
  expect(outputs.map(o => [o.width, o.height])).toEqual([[160, 240], [240, 160], [240, 160]]);
  for (const output of outputs) { expect(output.first[0]).toBeGreaterThan(170); expect(output.last[2]).toBeGreaterThan(170); }
  await page.goto('/en/meta-remover/');
  await expect(page.locator('[data-tool]')).toHaveAttribute('data-ready', 'true');
  await page.locator('#files').setInputFiles('tests/fixtures/orientation-6.jpg');
  await page.locator('#process').click();
  await expect(page.locator('#results a')).toHaveCount(1);
  expect(await page.locator('#results a').evaluate(async a => { const image = new Image(); image.src = (a as HTMLAnchorElement).href; await image.decode(); return [image.width, image.height]; })).toEqual([160, 240]);
});

test('mobile PDF page limit rejects excess pages before rendering; corrupt input can be replaced', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/en/page-replacer/');
  await expect(page.locator('[data-tool]')).toHaveAttribute('data-ready', 'true');
  const pdf = await PDFDocument.create();
  for (let i = 0; i < 51; i++) pdf.addPage([200, 200]);
  await page.locator('#files').setInputFiles({ name: '51-pages.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) });
  await expect(page.locator('#tool-status')).toContainText('page limit');
  await expect(page.locator('.page-tile')).toHaveCount(0);
  await page.locator('#files').setInputFiles({ name: 'broken.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\ninvalid') });
  await expect(page.locator('#tool-status')).toContainText('Could not read the PDF');
  const valid = await PDFDocument.create(); valid.addPage([200, 200]);
  await page.locator('#files').setInputFiles({ name: 'valid.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await valid.save()) });
  await expect(page.locator('.page-tile')).toHaveCount(1);
});
