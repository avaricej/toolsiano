import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { simplifyDesktop } from '../scripts/desktop-layout.mjs';
import { validateBatch, limits, resultLimit } from '../src/lib/resources.ts';
import { installerArchitecture } from '../scripts/github-releases.mjs';

test('native disclosures preserve controls and warnings while keeping the primary action visible', () => {
  const { document } = parseHTML(
    `<html lang="ru"><head></head><body><aside class="sidebar"><a class="nav-link"><svg></svg>Изображения</a></aside><div class="topbar-left"></div><section class="tool-heading"></section><section data-tool="image-tools"><fieldset id="tool-controls" disabled><legend>Настройки</legend><label class="dropzone"><input id="files" type="file"></label><p class="note">Подсказка</p><div class="control-panel"><div class="field"><input id="image-format" value="png"></div><div class="field"><input id="image-rotate" value="0"></div><div class="field"><input id="image-crop" value="none"></div><div class="field"><input id="image-filter" value="none"></div><fieldset id="watermark-controls"><legend>Водяной знак</legend><input id="wm-type" value="none"></fieldset><button id="process">Обработать</button></div></fieldset><p id="tool-status" role="status"></p></section><div class="tool-docs"><section>Ограничения</section></div></body></html>`,
  );
  const before = [...document.querySelectorAll('input,button')].map((node) => node.id).sort();
  simplifyDesktop(document, 'x86');
  assert.deepEqual(
    [...document.querySelectorAll('input,button')]
      .filter((node) => node.id !== 'desktop-sidebar-toggle')
      .map((node) => node.id)
      .sort(),
    before,
  );
  assert.equal(
    document.querySelector('#process')?.parentElement?.className,
    'desktop-primary-actions',
  );
  assert.ok(!document.querySelector('#image-format')?.closest('details'));
  assert.ok(document.querySelector('#image-filter')?.closest('details'));
  assert.equal(document.querySelectorAll('details[open]').length, 0);
  assert.equal(document.querySelector('#tool-status')?.getAttribute('role'), 'status');
  assert.ok(document.querySelector('#tool-controls')?.hasAttribute('disabled'));
  assert.equal(document.querySelector('.nav-link')?.getAttribute('aria-label'), 'Изображения');
  assert.ok(document.querySelector('.desktop-limit-note')?.textContent?.includes('50 МБ'));
});

test('x86 has a smaller memory budget and cannot be confused with x86_64 packages', () => {
  assert.equal(installerArchitecture('Toolsiano_1.0.0_x86-setup.exe'), 'x86');
  assert.equal(installerArchitecture('Toolsiano_1.0.0_x86_64.AppImage'), 'x64');
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { documentElement: { dataset: { runtime: 'desktop', architecture: 'x86' } } },
  });
  try {
    assert.deepEqual(limits(), { pixels: 12000000, pages: 50 });
    assert.equal(resultLimit(), 50 * 1024 * 1024);
    assert.throws(() => validateBatch(Array.from({ length: 16 }, () => ({ size: 1 })) as File[]));
    assert.throws(() =>
      validateBatch(Array.from({ length: 3 }, () => ({ size: 20 * 1024 * 1024 })) as File[]),
    );
  } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});
