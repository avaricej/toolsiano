import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts, pushGraphicsState, popGraphicsState,
  concatTransformationMatrix, drawObject } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

async function documentWithJpx() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([200, 200]);
  const symbol = await pdf.embedFont(StandardFonts.Symbol);
  page.drawText('ΑΒΓ', { x: 20, y: 170, font: symbol, size: 20 });
  const image = pdf.context.register(pdf.context.stream(
    await readFile('tests/fixtures/pdf-image.jp2'),
    { Type: 'XObject', Subtype: 'Image', Width: 32, Height: 24,
      ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Filter: 'JPXDecode' },
  ));
  const name = page.node.newXObject('LocalImage', image);
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(160, 0, 0, 120, 20, 20),
    drawObject(name), popGraphicsState());
  return { name: 'local-resources.pdf', mimeType: 'application/pdf',
    buffer: Buffer.from(await pdf.save()) };
}

test('PDF export renders JPEG 2000 pixels and Symbol text using bundled resources, including offline', async ({ page, context, request }) => {
  const resources: string[] = [];
  const warnings: string[] = [];
  page.on('request', r => { if (r.url().includes('/pdfjs/')) resources.push(r.url()); });
  page.on('console', m => {
    if (/Unable to load|wasmUrl|standardFontDataUrl|cMapUrl|Error during font loading/.test(m.text()))
      warnings.push(m.text());
  });
  await page.goto('/en/');
  await page.locator('#offline-install').click();
  await page.locator('#offline-save').click();
  await expect(page.locator('#offline-state')).toContainText('saved in this browser', { timeout: 60000 });
  await page.locator('#offline-close').click();
  await context.setOffline(true);
  await page.goto('/en/pdf-export/');
  await expect(page.locator('[data-tool]')).toHaveAttribute('data-ready', 'true');
  await page.locator('#files').setInputFiles(await documentWithJpx());
  await page.locator('#export-format').selectOption('image/png');
  await page.locator('#process').click();
  await expect(page.locator('#results a')).toHaveCount(1);
  const pixels = await page.locator('#results a').evaluate(async (a: HTMLAnchorElement) => {
    const image = new Image(); image.src = a.href; await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
    const color = [...ctx.getImageData(Math.round(image.width * .5), Math.round(image.height * .6), 1, 1).data];
    const data = ctx.getImageData(0, 0, image.width, Math.round(image.height * .2)).data;
    let ink = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] < 80 && data[i + 1] < 80 && data[i + 2] < 80) ink++;
    return { color, ink };
  });
  expect(pixels.color[0]).toBeGreaterThan(180);
  expect(pixels.color[1]).toBeLessThan(70);
  expect(pixels.ink).toBeGreaterThan(30);
  expect(resources.some(url => url.endsWith('/openjpeg.wasm'))).toBe(true);
  expect(resources.some(url => url.endsWith('/FoxitSymbol.pfb'))).toBe(true);
  expect(warnings).toEqual([]);
  await context.setOffline(false);
  const notices = await (await request.get('/third-party-licenses.txt')).text();
  for (const name of ['LICENSE_FOXIT', 'LICENSE_LIBERATION', 'LICENSE_OPENJPEG', 'LICENSE_JBIG2', 'LICENSE_QCMS'])
    expect(notices).toContain(name);
  expect(notices).toContain('Copyright (c) 2013 Julian Gruber');
});
