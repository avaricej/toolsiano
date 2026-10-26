import { t } from './i18n.ts';
import { is32BitDesktop } from './resources.ts';

export async function decodeAvif(file: Blob, dimensions: [number, number] | null) {
  const maximum = is32BitDesktop() || matchMedia('(max-width: 600px)').matches ? 2000000 : 4000000;
  if (!dimensions || dimensions[0] * dimensions[1] > maximum)
    throw new Error(t('Для программного открытия AVIF уменьшите изображение: максимум 4 Мп, на узком экране и в x86 — 2 Мп.'));
  const bytes = await file.arrayBuffer();
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const worker = new Worker(new URL('../workers/avif-decode.ts', import.meta.url), { type: 'module' });
    const finish = (pixels?: ArrayBuffer) => {
      clearTimeout(timer); worker.terminate();
      if (pixels?.byteLength === dimensions[0] * dimensions[1] * 4) resolve(pixels);
      else reject(new Error(t('Не удалось открыть AVIF. Проверьте файл или выберите другой формат.')));
    };
    const timer = setTimeout(() => finish(), 20000);
    worker.onmessage = (event: MessageEvent<{ pixels?: ArrayBuffer }>) => finish(event.data.pixels);
    worker.onerror = event => { event.preventDefault(); finish(); };
    worker.postMessage({ bytes, width: dimensions[0], height: dimensions[1] }, [bytes]);
  });
}
