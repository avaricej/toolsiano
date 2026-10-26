import { t } from './i18n.ts';
import { MAX_FILE, is32BitDesktop, isJobCancelled, yieldUI } from './resources.ts';
import { toBlob } from './ui.ts';

export function avifPixelLimit() {
  return is32BitDesktop() ||
    (typeof matchMedia !== 'undefined' && matchMedia('(max-width: 600px)').matches)
    ? 2000000
    : 4000000;
}
export function validateAvifSize(width: number, height: number) {
  if (width * height > avifPixelLimit())
    throw new Error(t('Для AVIF уменьшите размер: максимум 4 Мп, на узком экране и в x86 — 2 Мп.'));
}
async function avif(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  validateAvifSize(canvas.width, canvas.height);
  if (typeof WebAssembly === 'undefined')
    throw new Error(t('Для экспорта AVIF нужна поддержка WebAssembly.'));
  const image = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
  const data = new Uint8Array(image.data).buffer;
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/avif.ts', import.meta.url), { type: 'module' });
    const finish = (error?: string, buffer?: ArrayBuffer) => {
      clearTimeout(timeout);
      clearInterval(cancel);
      worker.terminate();
      if (error) reject(new Error(error));
      else resolve(new Blob([buffer!], { type: 'image/avif' }));
    };
    const timeout = setTimeout(
      () => finish(t('Экспорт AVIF занимает слишком долго. Уменьшите размер изображения.')),
      60000,
    );
    const cancel = setInterval(() => {
      if (isJobCancelled()) finish(t('Обработка остановлена. Готовые результаты сохранены.'));
    }, 100);
    worker.onmessage = (event: MessageEvent<{ buffer?: ArrayBuffer; error?: boolean }>) => {
      if (event.data.error || !(event.data.buffer instanceof ArrayBuffer))
        finish(t('Не удалось создать AVIF. Уменьшите размер или выберите другой формат.'));
      else finish(undefined, event.data.buffer);
    };
    worker.onerror = (event) => {
      event.preventDefault();
      finish(
        t(
          'Не удалось запустить кодировщик AVIF. Обновите офлайн-копию или выберите другой формат.',
        ),
      );
    };
    worker.postMessage({ pixels: data, width: canvas.width, height: canvas.height, quality }, [
      data,
    ]);
  });
}
async function svg(canvas: HTMLCanvasElement) {
  const png = await toBlob(canvas, 'image/png');
  if (Math.ceil(png.size / 3) * 4 + 512 > MAX_FILE)
    throw new Error(t('SVG будет больше 25 МБ. Уменьшите размер изображения или сохраните PNG.'));
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(t('Не удалось подготовить изображение для SVG.')));
    reader.readAsDataURL(png);
  });
  // Only our freshly encoded PNG is embedded. No source markup, filenames or text are interpolated.
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}"><image width="${canvas.width}" height="${canvas.height}" href="${data}"/></svg>`;
  return new Blob([markup], { type: 'image/svg+xml' });
}
export async function exportImage(canvas: HTMLCanvasElement, type: string, quality: number) {
  const blob =
    type === 'image/avif'
      ? await avif(canvas, Math.round(quality * 100))
      : type === 'image/svg+xml'
        ? await svg(canvas)
        : await toBlob(canvas, type, quality);
  await yieldUI(); // Discard a completed encode if cancellation arrived before the result.
  if (blob.type !== type)
    throw new Error(t('Браузер не поддерживает сохранение в выбранный формат. Выберите PNG.'));
  return blob;
}
