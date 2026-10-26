import { t } from './i18n.ts';
import { isDesktop } from './runtime.ts';
export function is32BitDesktop() {
  return isDesktop() && document.documentElement.dataset.architecture === 'x86';
}
export function resultLimit() {
  return (is32BitDesktop() ? 50 : 100) * 1024 * 1024;
}
export const MAX_FILE = 25 * 1024 * 1024;
export const MAX_TOTAL = 100 * 1024 * 1024;
export const MAX_FILES = 30;
export const MAX_SIDE = 16384;
export function limits() {
  if (is32BitDesktop()) return { pixels: 12000000, pages: 50 };
  const small = typeof matchMedia !== 'undefined' && matchMedia('(max-width: 600px)').matches;
  return { pixels: small ? 12000000 : 24000000, pages: small ? 50 : 100 };
}
export function validateBatch(files: File[]) {
  if (is32BitDesktop()) {
    if (files.length > 15) throw new Error(t('Лимит — 15 файлов на задание'));
    if (files.reduce((n, file) => n + file.size, 0) > 50 * 1024 * 1024)
      throw new Error(t('Суммарный размер файлов больше 50 МБ'));
  }
  if (files.length > MAX_FILES) throw new Error(t('Лимит — 30 файлов на задание'));
  if (files.reduce((n, f) => n + f.size, 0) > MAX_TOTAL)
    throw new Error(t('Суммарный размер файлов больше 100 МБ'));
  if (files.some((f) => f.size > MAX_FILE)) throw new Error(t('Один из файлов больше 25 МБ'));
}
export function canvas(w: number, h: number) {
  w = Math.max(1, Math.ceil(w));
  h = Math.max(1, Math.ceil(h));
  if (w > MAX_SIDE || h > MAX_SIDE || w * h > limits().pixels)
    throw new Error(t('Изображение слишком большое для безопасной обработки на этом устройстве'));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
let cancelled = false;
export function beginJob() {
  cancelled = false;
}
export function cancelJob() {
  cancelled = true;
}
export function isJobCancelled() {
  return cancelled;
}
export async function yieldUI() {
  await new Promise<void>((r) => setTimeout(r, 0));
  if (cancelled) throw new Error(t('Обработка остановлена. Готовые результаты сохранены.'));
}
export function pageRange(input: string, count: number) {
  if (!input.trim()) return Array.from({ length: count }, (_, i) => i);
  const pages: number[] = [];
  for (const token of input.replace(/[–—]/g, '-').split(',')) {
    const m = token.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) throw new Error(t('Неверный диапазон страниц. Пример: 1–3, 7'));
    const start = Number(m[1]),
      end = Number(m[2] || m[1]);
    if (start < 1 || end < start || end > count)
      throw new Error(t('Номер страницы выходит за пределы документа'));
    for (let p = start; p <= end; p++) {
      if (pages.includes(p - 1)) throw new Error(t('Страница указана несколько раз'));
      pages.push(p - 1);
    }
  }
  return pages;
}
// Read dimensions before decoding, so oversized compressed images can be rejected early.
export async function imageDimensions(blob: Blob): Promise<[number, number] | null> {
  const a = new Uint8Array(await blob.slice(0, 1024 * 1024).arrayBuffer());
  const d = new DataView(a.buffer);
  if (a.length >= 24 && a[0] === 137 && a[1] === 80) return [d.getUint32(16), d.getUint32(20)];
  if (a[0] === 255 && a[1] === 216) {
    let i = 2;
    while (i + 4 < a.length) {
      if (a[i] !== 255) {
        i++;
        continue;
      }
      const marker = a[i + 1];
      if (marker === 0xd9 || marker === 0xda) break;
      const len = d.getUint16(i + 2);
      if (
        [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
          marker,
        ) &&
        i + 9 < a.length
      )
        return [d.getUint16(i + 7), d.getUint16(i + 5)];
      if (len < 2) break;
      i += len + 2;
    }
  }
  if (a.length >= 30 && String.fromCharCode(...a.slice(0, 4)) === 'RIFF') {
    const kind = String.fromCharCode(...a.slice(12, 16));
    if (kind === 'VP8X')
      return [1 + a[24] + (a[25] << 8) + (a[26] << 16), 1 + a[27] + (a[28] << 8) + (a[29] << 16)];
    if (kind === 'VP8L')
      return [
        1 + a[21] + ((a[22] & 63) << 8),
        1 + (a[22] >> 6) + (a[23] << 2) + ((a[24] & 15) << 10),
      ];
    if (kind === 'VP8 ') return [d.getUint16(26, true) & 16383, d.getUint16(28, true) & 16383];
  }
  return null;
}
