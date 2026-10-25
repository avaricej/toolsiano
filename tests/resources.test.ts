import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pageRange,
  imageDimensions,
  validateBatch,
  MAX_FILE,
  MAX_TOTAL,
  limits,
  canvas,
  MAX_SIDE,
} from '../src/lib/resources.ts';
import { stripJpeg, stripPng } from '../src/lib/image-processing.ts';
import { translate } from '../src/lib/i18n.ts';
import { defaultLanguage, routeRequest } from '../scripts/routing.mjs';
import ts from 'typescript';
import { readdirSync, readFileSync } from 'node:fs';
test('all literal client translation keys have English equivalents', () => {
  function inspect(dir: string) {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const path = dir + '/' + item.name;
      if (item.isDirectory()) inspect(path);
      else if (item.name.endsWith('.ts')) {
        const ast = ts.createSourceFile(
          path,
          readFileSync(path, 'utf8'),
          ts.ScriptTarget.Latest,
          true,
        );
        function visit(n: ts.Node) {
          if (
            ts.isCallExpression(n) &&
            ts.isIdentifier(n.expression) &&
            n.expression.text === 't'
          ) {
            const arg = n.arguments[0];
            let key = '';
            if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) key = arg.text;
            else if (ts.isTemplateExpression(arg)) {
              key = arg.head.text;
              arg.templateSpans.forEach((span, i) => (key += '{' + i + '}' + span.literal.text));
            }
            if (key) assert.ok(!/[А-Яа-яЁё]/.test(translate(key)), path + ': ' + key);
          }
          ts.forEachChild(n, visit);
        }
        visit(ast);
      }
    }
  }
  inspect('src/lib');
  inspect('src/scripts');
});
test('PNG cleanup removes text blocks without changing pixel chunks', () => {
  const original = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==',
    'base64',
  );
  const secret = Buffer.from('Author\0Private Identity');
  const chunk = Buffer.alloc(secret.length + 12);
  chunk.writeUInt32BE(secret.length);
  chunk.write('tEXt', 4);
  secret.copy(chunk, 8);
  const withText = Buffer.concat([original.subarray(0, -12), chunk, original.subarray(-12)]);
  assert.deepEqual(Buffer.from(stripPng(withText)), original);
});
test('ranges preserve order and reject duplicates, invalid tokens and bounds', () => {
  assert.deepEqual(pageRange('1–3, 7', 7), [0, 1, 2, 6]);
  assert.deepEqual(pageRange('', 3), [0, 1, 2]);
  assert.deepEqual(pageRange('3,1', 3), [2, 0]);
  for (const s of ['0', '2-1', '1,1', '1,', '8', '1-900000']) assert.throws(() => pageRange(s, 7));
});
test('resource checks cap aggregate files and reject oversized PNG before decode', async () => {
  assert.throws(() => canvas(MAX_SIDE + 1, 1));
  const header = new Uint8Array(24);
  header.set([137, 80, 78, 71]);
  const view = new DataView(header.buffer);
  view.setUint32(16, 50000);
  view.setUint32(20, 50000);
  assert.deepEqual(await imageDimensions(new Blob([header])), [50000, 50000]);
  assert.throws(() => validateBatch([{ size: MAX_FILE + 1 }] as File[]));
  assert.throws(() => validateBatch(Array.from({ length: 31 }, () => ({ size: 1 })) as File[]));
  assert.throws(() =>
    validateBatch(Array.from({ length: 5 }, () => ({ size: 25 * 1024 * 1024 })) as File[]),
  );
});
test('JPEG cleanup strips APP metadata and preserves compressed scan bytes', () => {
  const jpeg = new Uint8Array([
    255, 216, 255, 225, 0, 5, 65, 66, 67, 255, 254, 0, 3, 88, 255, 218, 0, 2, 3, 4, 5, 255, 217,
  ]);
  const clean = stripJpeg(jpeg);
  assert.deepEqual(Array.from(clean), [255, 216, 255, 218, 0, 2, 3, 4, 5, 255, 217]);
  assert.throws(() => stripJpeg(new Uint8Array([1, 2, 3])));
});
test('translations preserve dynamic values and handle empty final placeholders', () => {
  assert.equal(translate('Выбрано файлов: 2'), 'Files selected: 2');
  assert.equal(translate('Готово файлов: 2 из 2.'), 'Files completed: 2 of 2.');
  assert.equal(translate('Страница не найдена — Toolsiano'), 'Page not found — Toolsiano');
  assert.equal(
    translate('Обрабатываем 1 из 2: private-photo.jpg'),
    'Processing 1 of 2: private-photo.jpg',
  );
});
test('domain default and explicit locale routes', () => {
  assert.equal(defaultLanguage('toolsiano.com:4321'), 'en');
  assert.equal(defaultLanguage('www.toolsiano.ru'), 'ru');
  assert.equal(defaultLanguage('localhost:4321'), 'ru');
  assert.deepEqual(routeRequest('/', 'toolsiano.com'), { status: 302, location: '/en/' });
  assert.deepEqual(routeRequest('/pdf/', 'toolsiano.ru'), { status: 301, location: '/ru/pdf/' });
  assert.equal(routeRequest('/ru/pdf/', 'toolsiano.com'), null);
  assert.equal(routeRequest('/en/pdf/', 'toolsiano.ru'), null);
  assert.deepEqual(routeRequest('/en/pomodoro/', 'toolsiano.com'), { status: 410 });
});
