import { t } from './i18n.ts';
import { isDesktop } from './runtime.ts';
import {
  validateBatch,
  imageDimensions,
  limits,
  MAX_SIDE,
  resultLimit,
  beginJob,
  cancelJob,
  yieldUI,
} from './resources.ts';
export const $ = <T extends HTMLElement = HTMLElement>(id: string) => {
  const e = document.getElementById(id);
  if (!e) throw new Error(t('Не найден элемент ') + id);
  return e as T;
};
export const value = (id: string) => $<HTMLInputElement>(id).value;
export const checked = (id: string) => $<HTMLInputElement>(id).checked;
export function number(id: string, min: number, max: number) {
  const n = Number(value(id));
  if (!Number.isFinite(n) || n < min || n > max)
    throw new Error(
      t(
        `Значение «${document.querySelector(`label[for="${id}"]`)?.textContent || id}» должно быть от ${min} до ${max}`,
      ),
    );
  return n;
}
export function status(message: string, error = false) {
  const e = $('tool-status');
  e.setAttribute('role', error ? 'alert' : 'status');
  e.setAttribute('aria-live', error ? 'assertive' : 'polite');
  e.textContent = message;
  e.classList.toggle('error', error);
}
export function text(tag: string, content: string, className = '') {
  const e = document.createElement(tag);
  e.textContent = content;
  e.className = className;
  return e;
}
export function size(n: number) {
  return n < 1024
    ? n + t(' Б')
    : n < 1048576
      ? (n / 1024).toFixed(1) + t(' КБ')
      : (n / 1048576).toFixed(1) + t(' МБ');
}
const urls = new Set<string>();
let outputs: {
  blob: Blob;
  name: string;
}[] = [];
export function objectURL(blob: Blob) {
  const u = URL.createObjectURL(blob);
  urls.add(u);
  return u;
}
export function revoke(u: string) {
  URL.revokeObjectURL(u);
  urls.delete(u);
}
if (typeof addEventListener !== 'undefined')
  addEventListener('pagehide', () => {
    urls.forEach((u) => URL.revokeObjectURL(u));
    urls.clear();
  });
export async function download(blob: Blob, name: string) {
  if (isDesktop()) {
    const { saveDesktopFile } = await import('../scripts/desktop.ts');
    await saveDesktopFile(blob, name);
    return;
  }
  const u = objectURL(blob);
  const a = document.createElement('a');
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => revoke(u), 30000);
}
export function clearResults() {
  outputs = [];
  const r = $('results');
  r.querySelectorAll<HTMLAnchorElement>('a[href^="blob:"]').forEach((a) => revoke(a.href));
  r.replaceChildren();
}
export function result(blob: Blob, name: string, detail = '') {
  if (outputs.reduce((n, r) => n + r.blob.size, 0) + blob.size > resultLimit())
    throw new Error(
      t(
        resultLimit() < 100 * 1024 * 1024
          ? 'Результаты занимают больше 50 МБ. Скачайте готовые файлы и уменьшите задание.'
          : 'Результаты занимают больше 100 МБ. Скачайте готовые файлы и уменьшите задание.',
      ),
    );
  outputs.push({ blob, name });
  const row = text('div', '', 'file-row');
  const info = text('div', name, 'file-info');
  info.append(text('small', `${size(blob.size)}${detail ? ' · ' + detail : ''}`));
  const a = text('a', t('Скачать')) as HTMLAnchorElement;
  a.href = objectURL(blob);
  a.download = name;
  if (isDesktop())
    a.addEventListener('click', async (event) => {
      event.preventDefault();
      a.setAttribute('aria-busy', 'true');
      try {
        await download(blob, name);
      } catch (error) {
        status(
          error instanceof Error
            ? error.message
            : t('Не удалось сохранить файл. Проверьте доступ и свободное место.'),
          true,
        );
      } finally {
        a.removeAttribute('aria-busy');
      }
    });
  row.append(info, a);
  $('results').append(row);
}
export async function copy(content: string) {
  if (!content) throw new Error(t('Сначала создайте результат'));
  try {
    await navigator.clipboard.writeText(content);
  } catch {
    throw new Error(t('Буфер обмена недоступен. Выделите результат и скопируйте вручную.'));
  }
}
export function action(id: string, fn: () => void | Promise<void>) {
  $(id).addEventListener('click', async () => {
    const b = $<HTMLButtonElement>(id);
    const controls = document.getElementById('tool-controls') as HTMLFieldSetElement | null;
    if (controls?.disabled) return;
    if (controls) controls.disabled = true;
    b.disabled = true;
    beginJob();
    const cancel = document.getElementById('cancel-job');
    if (cancel && ['process', 'split-pdf', 'zip-results'].includes(id)) cancel.hidden = false;
    try {
      status('');
      await fn();
    } catch (e) {
      status(e instanceof Error ? e.message : t('Не удалось обработать данные'), true);
    } finally {
      b.disabled = false;
      const focusWasLost =
        document.activeElement === document.body || document.activeElement === cancel;
      if (cancel) cancel.hidden = true;
      if (controls) controls.disabled = false;
      if (focusWasLost && !b.hidden) b.focus({ preventScroll: true });
    }
  });
}
export function resultActions() {
  const panel = document.getElementById('result-actions');
  const results = document.getElementById('results');
  document.getElementById('cancel-job')?.addEventListener('click', () => {
    cancelJob();
    status(t('Останавливаем обработку…'));
  });
  if (!panel || !results) return;
  const update = () => {
    panel.hidden = !outputs.length;
    ($('zip-results') as HTMLButtonElement).hidden = outputs.length < 2;
  };
  new MutationObserver(update).observe(results, { childList: true });
  action('clear-results', () => {
    clearResults();
    update();
    status(t('Результаты очищены'));
  });
  action('zip-results', async () => {
    if (!outputs.length) return;
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    outputs.forEach((r, i) => zip.file(`${String(i + 1).padStart(2, '0')}-${r.name}`, r.blob));
    const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
    await yieldUI();
    await download(blob, 'toolsiano-results.zip');
  });
}
export function upload(id: string, onFiles: (files: File[]) => void | Promise<void>) {
  const input = $<HTMLInputElement>(id);
  const zone = input.closest('.dropzone')!;
  let accepting = false;
  const accept = async (files: File[]) => {
    if (accepting || (document.getElementById('tool-controls') as HTMLFieldSetElement)?.disabled)
      return;
    accepting = true;
    const controls = document.getElementById('tool-controls') as HTMLFieldSetElement | null;
    if (controls) controls.disabled = true;
    input.disabled = true;
    zone.setAttribute('aria-busy', 'true');
    try {
      status('');
      validateBatch(files);
      await onFiles(files);
    } catch (e) {
      status(e instanceof Error ? e.message : t('Ошибка чтения файла'), true);
    } finally {
      input.value = '';
      input.disabled = false;
      accepting = false;
      if (controls) controls.disabled = false;
      zone.removeAttribute('aria-busy');
      if (document.activeElement === document.body) input.focus({ preventScroll: true });
    }
  };
  input.addEventListener('change', () => void accept(Array.from(input.files || [])));
  for (const ev of ['dragenter', 'dragover'])
    zone.addEventListener(ev, (e) => {
      e.preventDefault();
      zone.classList.add('dragover');
    });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    void accept(Array.from((e as DragEvent).dataTransfer?.files || []));
  });
}
export function fileList(files: File[], onChange: () => void) {
  const list = $('file-list');
  list.replaceChildren();
  files.forEach((f, i) => {
    const row = text('div', '', 'file-row');
    const info = text('div', f.name, 'file-info');
    info.append(text('small', size(f.size)));
    row.append(info);
    for (const [label, title, fn] of [
      [
        '↑',
        t('Выше'),
        () => {
          if (i > 0) [files[i - 1], files[i]] = [files[i], files[i - 1]];
        },
      ],
      [
        '↓',
        t('Ниже'),
        () => {
          if (i < files.length - 1) [files[i + 1], files[i]] = [files[i], files[i + 1]];
        },
      ],
      ['×', t('Удалить'), () => files.splice(i, 1)],
    ] as const) {
      const b = text('button', label) as HTMLButtonElement;
      b.type = 'button';
      b.setAttribute('aria-label', title + ' ' + f.name);
      b.addEventListener('click', () => {
        fn();
        onChange();
      });
      row.append(b);
    }
    list.append(row);
  });
}
export async function loadImage(file: Blob) {
  const dimensions = await imageDimensions(file);
  if (
    dimensions &&
    (Math.max(...dimensions) > MAX_SIDE || dimensions[0] * dimensions[1] > limits().pixels)
  )
    throw new Error(t('Изображение слишком большое для безопасной обработки на этом устройстве'));
  const url = objectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (
      Math.max(image.naturalWidth, image.naturalHeight) > MAX_SIDE ||
      image.naturalWidth * image.naturalHeight > limits().pixels
    )
      throw new Error(t('Изображение слишком большое для безопасной обработки на этом устройстве'));
    return image;
  } catch (e) {
    if (e instanceof Error && e.message.includes(t('безопасной'))) throw e;
    throw new Error(t('Не удалось прочитать изображение. Поддерживаются JPG, PNG и WebP.'));
  } finally {
    revoke(url);
  }
}
export function toBlob(
  canvas: HTMLCanvasElement,
  type = 'image/png',
  quality = 0.85,
): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error(t('Браузер не смог создать изображение')))),
      type,
      quality,
    ),
  );
}
export const bytesBlob = (bytes: Uint8Array, type: string) =>
  new Blob([new Uint8Array(bytes).buffer], { type });
