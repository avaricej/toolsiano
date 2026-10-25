import { test, expect } from '@playwright/test';
import { tools } from '../../src/data/tools.ts';

test('first-image preview follows reordering and clears when files are removed', async ({
  page,
}) => {
  await page.goto('/en/image-tools/');
  await expect(page.locator('[data-tool]')).toHaveAttribute('data-ready', 'true');
  const images = await page.evaluate(() =>
    ['#ffffff', '#ff0000'].map((color) => {
      const c = document.createElement('canvas');
      c.width = c.height = 20;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 20, 20);
      return c.toDataURL().split(',')[1];
    }),
  );
  await page.locator('#files').setInputFiles(
    images.map((base64, i) => ({
      name: i + '.png',
      mimeType: 'image/png',
      buffer: Buffer.from(base64, 'base64'),
    })),
  );
  await page.locator('#file-list .file-row').nth(1).locator('button').first().click();
  await expect
    .poll(() =>
      page
        .locator('#image-preview canvas')
        .evaluate(
          (c) => (c as HTMLCanvasElement).getContext('2d')!.getImageData(0, 0, 1, 1).data[1],
        ),
    )
    .toBe(0);
  await page.locator('#file-list .file-row').first().locator('button').last().click();
  await expect
    .poll(() =>
      page
        .locator('#image-preview canvas')
        .evaluate(
          (c) => (c as HTMLCanvasElement).getContext('2d')!.getImageData(0, 0, 1, 1).data[1],
        ),
    )
    .toBe(255);
  await page.locator('#file-list .file-row').first().locator('button').last().click();
  await expect(page.locator('#image-preview canvas')).toHaveCount(0);
});

test('scan grayscale actually changes image pixels', async ({ page }) => {
  await page.goto('/en/scan-tools/');
  await expect(page.locator('[data-tool]')).toHaveAttribute('data-ready', 'true');
  const base64 = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, 32, 32);
    return c.toDataURL().split(',')[1];
  });
  await page.locator('#files').setInputFiles({
    name: 'red.png',
    mimeType: 'image/png',
    buffer: Buffer.from(base64, 'base64'),
  });
  await page.locator('#process').click();
  await expect(page.locator('#results a')).toHaveCount(1);
  const channels = await page.locator('#results a').evaluate(async (a) => {
    const image = new Image();
    image.src = (a as HTMLAnchorElement).href;
    await image.decode();
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    return [...ctx.getImageData(16, 16, 1, 1).data];
  });
  expect(Math.max(...channels.slice(0, 3)) - Math.min(...channels.slice(0, 3))).toBeLessThan(3);
});

test('offline copy has persistent status and can be removed without deleting theme or unrelated storage', async ({
  page,
  context,
}) => {
  await page.goto('/en/');
  await page.locator('#offline-install').click();
  await expect(page.locator('#offline-state')).toContainText('No offline copy');
  await page.locator('#offline-save').click();
  await expect(page.locator('#toast')).toContainText('The offline copy is saved', {
    timeout: 60000,
  });
  await expect(page.locator('#offline-state')).toContainText('Saved on:');
  await page.locator('#offline-close').click();
  await page.reload();
  await context.setOffline(true);
  await page.goto('/en/password/');
  await expect(page.locator('#password-output')).not.toHaveValue('');
  await page.locator('#offline-install').click();
  await expect(page.locator('#offline-state')).toContainText('An offline copy is saved');
  await page.screenshot({ path: 'outputs/offline-manager.png' });
  await page.evaluate(async () => {
    localStorage.setItem('toolsiano-theme', 'dark');
    await caches.open('unrelated-app');
  });
  await page.locator('#offline-remove').click();
  await expect(page.locator('#offline-state')).toContainText('No offline copy');
  await expect(page.locator('#offline-remove')).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem('toolsiano-theme'))).toBe('dark');
  const names = await page.evaluate(() => caches.keys());
  expect(names).toContain('unrelated-app');
  expect(names.filter((k) => k.startsWith('toolsiano-'))).toEqual([]);
  await context.setOffline(false);
});

test('mobile menu, upload and processing keep a visible keyboard focus and announce errors', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/en/image-tools/');
  await expect(page.locator('[data-tool]')).toHaveAttribute('data-ready', 'true');
  expect(await page.locator('#sidebar').evaluate((el) => (el as HTMLElement).inert)).toBe(true);
  const menu = page.locator('#menu-toggle');
  await menu.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await expect(page.locator('#sidebar .brand')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeFocused();
  await expect(menu).toHaveAttribute('aria-label', 'Open menu');
  await page.locator('#files').focus();
  expect(await page.locator('.dropzone').evaluate((el) => getComputedStyle(el).outlineStyle)).toBe(
    'solid',
  );
  await page.locator('#process').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#tool-status')).toHaveAttribute('role', 'alert');
  await expect(page.locator('#process')).toBeFocused();
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
    }, theme);
    const contrast = await page.locator('#tool-status').evaluate((el) => {
      const luminance = (color: string) => {
        // WebKit may serialize a computed color as color(srgb ...) rather than rgb(...).
        const sample = document.createElement('canvas');
        sample.width = sample.height = 1;
        const ctx = sample.getContext('2d')!;
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        const c = [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).map((n) => {
          n /= 255;
          return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      };
      const fg = luminance(getComputedStyle(el).color),
        bg = luminance(getComputedStyle(document.querySelector('.workspace')!).backgroundColor);
      return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
    });
    expect(contrast).toBeGreaterThanOrEqual(4.5);
  }
  await page.locator('#offline-install').click();
  await expect(page.locator('#offline-close')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#offline-install')).toBeFocused();
});

test('all tools have specific bilingual guides, unique IDs and named form controls', async ({
  page,
}) => {
  for (const lang of ['en', 'ru'])
    for (const tool of tools) {
      await page.goto('/' + lang + '/' + tool.slug + '/');
      await expect(page.locator('[data-tool]')).toHaveAttribute('data-ready', 'true');
      const guide = page.locator('.tool-docs section').first();
      await expect(guide.locator('li')).toHaveCount(3);
      expect((await guide.innerText()).length).toBeGreaterThan(250);
      if (lang === 'en') expect(await guide.innerText()).not.toMatch(/[А-Яа-яЁё]/);
      const errors = await page.evaluate(() => {
        const ids = [...document.querySelectorAll('[id]')].map((el) => el.id);
        const errors = ids.filter((id, i) => ids.indexOf(id) !== i).map((id) => 'duplicate: ' + id);
        for (const el of document.querySelectorAll<
          HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        >('input:not([type=hidden]), select, textarea'))
          if (
            !el.labels?.length &&
            !el.getAttribute('aria-label') &&
            !el.getAttribute('aria-labelledby')
          )
            errors.push('unnamed: ' + el.id);
        return errors;
      });
      expect(errors, tool.slug).toEqual([]);
    }
});
