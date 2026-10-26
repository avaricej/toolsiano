import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { avifDimensions, editorImageKind } from '../src/lib/editor-input.ts';

function box(name: string, ...parts: Buffer[]) {
  const payload = Buffer.concat(parts);
  const header = Buffer.alloc(8);
  header.writeUInt32BE(payload.length + 8);
  header.write(name, 4);
  return Buffer.concat([header, payload]);
}
const brand = box('ftyp', Buffer.from('avif\0\0\0\0avif', 'binary'));
function metadata(width: number, height: number) {
  const size = Buffer.alloc(12);
  size.writeUInt32BE(width, 4);
  size.writeUInt32BE(height, 8);
  return box('meta', Buffer.alloc(4), box('iprp', box('ipco', box('ispe', size))));
}
test('AVIF dimensions are read from real properties, including metadata after image data', async () => {
  const sample = await readFile(new URL('./fixtures/editor-sample.avif', import.meta.url));
  assert.equal(await editorImageKind(new Blob([sample])), 'avif');
  assert.deepEqual(await avifDimensions(new Blob([sample])), [80, 60]);
  assert.deepEqual(
    await avifDimensions(new Blob([brand, box('mdat', Buffer.alloc(1100000)), metadata(200, 100)])),
    [200, 100],
  );
});
test('AVIF rejects forged dimensions in image data, sequences, invalid boxes and oversized images before decode', async () => {
  await assert.rejects(avifDimensions(new Blob([brand, box('mdat', metadata(10, 10))])));
  await assert.rejects(
    avifDimensions(
      new Blob([box('ftyp', Buffer.from('avis\0\0\0\0avif', 'binary')), metadata(10, 10)]),
    ),
  );
  await assert.rejects(
    avifDimensions(new Blob([brand, metadata(50000, 50000)])),
    /слишком большое/,
  );
  const invalid = box('meta', Buffer.alloc(4));
  invalid.writeUInt32BE(10000);
  await assert.rejects(avifDimensions(new Blob([brand, invalid])));
  await assert.rejects(avifDimensions(new Blob([brand, box('moov'), metadata(10, 10)])));
  await assert.rejects(editorImageKind(new Blob(['not an image'])));
});
