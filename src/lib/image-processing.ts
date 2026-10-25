import { t } from './i18n.ts';
import { toBlob } from './ui.ts';
import { yieldUI } from './resources.ts';
export async function encodeTarget(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
  targetKB: number,
) {
  let blob = await toBlob(canvas, type, quality);
  if (!targetKB || blob.size <= targetKB * 1024) return { blob, hit: true };
  if (type === 'image/png') return { blob, hit: false };
  let low = 0.08,
    high = quality,
    best: Blob | null = null;
  for (let i = 0; i < 6; i++) {
    const q = (low + high) / 2;
    const next = await toBlob(canvas, type, q);
    if (next.size <= targetKB * 1024) {
      best = next;
      low = q;
    } else {
      high = q;
      if (next.size < blob.size) blob = next;
    }
    await yieldUI();
  }
  return { blob: best || blob, hit: !!best };
}
export function stripJpeg(bytes: Uint8Array) {
  if (bytes[0] !== 255 || bytes[1] !== 216) throw new Error(t('Некорректный JPEG'));
  const chunks: Uint8Array[] = [bytes.subarray(0, 2)];
  let i = 2;
  while (i + 3 < bytes.length) {
    if (bytes[i] !== 255) throw new Error(t('Некорректный JPEG'));
    const marker = bytes[i + 1];
    if (marker === 0xda || marker === 0xd9) {
      chunks.push(bytes.subarray(i));
      return join(chunks);
    }
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    if (length < 2 || i + 2 + length > bytes.length) throw new Error(t('Некорректный JPEG'));
    if (!(marker >= 0xe0 && marker <= 0xef) && marker !== 0xfe)
      chunks.push(bytes.subarray(i, i + 2 + length));
    i += 2 + length;
  }
  throw new Error(t('Некорректный JPEG'));
}
export function stripPng(bytes: Uint8Array) {
  const chunks = [bytes.subarray(0, 8)];
  const d = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let i = 8;
  const keep = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'sRGB', 'gAMA', 'cHRM']);
  while (i + 12 <= bytes.length) {
    const n = d.getUint32(i),
      end = i + n + 12;
    if (end > bytes.length) throw new Error(t('Некорректный PNG'));
    const type = String.fromCharCode(...bytes.subarray(i + 4, i + 8));
    if (type === 'acTL') throw new Error(t('Анимированный PNG: используйте обычное изображение'));
    if (keep.has(type)) chunks.push(bytes.subarray(i, end));
    i = end;
    if (type === 'IEND') return join(chunks);
  }
  throw new Error(t('Некорректный PNG'));
}
function join(chunks: Uint8Array[]) {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}
