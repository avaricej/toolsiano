import { t } from '../../lib/i18n.ts';
import { initPages } from './pdf-pages.ts';
import { canvas as limitedCanvas, validateBatch, limits, yieldUI } from '../../lib/resources.ts';
import { encodeTarget } from '../../lib/image-processing.ts';
import { PDFDocument, PDFSignature, degrees } from 'pdf-lib';
import {
  $,
  value,
  number,
  status,
  action,
  upload,
  fileList,
  loadImage,
  toBlob,
  clearResults,
  result,
  text,
  size,
  bytesBlob,
} from '../../lib/ui.ts';
let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | undefined;
export async function pdfjs() {
  return (pdfjsPromise ??= (async () => {
    const lib = await import('pdfjs-dist');
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    return lib;
  })());
}
// Every renderer uses the same local resources, including offline and native builds.
export async function renderPdf(data: Uint8Array) {
  const lib = await pdfjs();
  return lib.getDocument({
    data,
    cMapUrl: '/pdfjs/cmaps/',
    standardFontDataUrl: '/pdfjs/standard_fonts/',
    wasmUrl: '/pdfjs/wasm/',
    iccUrl: '/pdfjs/iccs/',
    useSystemFonts: false,
    enableXfa: false,
  });
}
export async function openPdf(bytes: ArrayBuffer) {
  try {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    if (doc.getPageCount() > limits().pages)
      throw new Error(t('Лимит страниц для этого устройства превышен'));
    if (
      doc
        .getForm()
        .getFields()
        .some((f) => f instanceof PDFSignature)
    )
      throw new Error(t('PDF с цифровой подписью не поддерживается: изменение нарушит подпись'));
    return doc;
  } catch (e) {
    if (e instanceof Error && /Лимит|подпись|page limit|signed PDFs/.test(e.message)) throw e;
    throw new Error(
      t('Не удалось прочитать PDF. Проверьте, что он исправен и не защищён паролем.'),
    );
  }
}
const newCanvas = limitedCanvas;
export function plainMetadata(doc: PDFDocument) {
  doc.setTitle('');
  doc.setAuthor('');
  doc.setSubject('');
  doc.setKeywords([]);
  doc.setProducer('Toolsiano');
  doc.setCreator('Toolsiano');
}
export function init(slug: string) {
  if (slug === 'page-replacer') return pages();
  if (slug === 'file-compressor') return compressor();
  return imagesToPdf();
}
function imagesToPdf() {
  const files: File[] = [];
  let busy = false;
  const refresh = () => fileList(files, refresh);
  upload('files', (incoming) => {
    if (busy) throw new Error(t('Дождитесь завершения обработки'));
    if (incoming.some((f) => !['image/jpeg', 'image/png', 'image/webp'].includes(f.type)))
      throw new Error(t('Выберите JPG, PNG или WebP'));
    validateBatch([...files, ...incoming]);
    files.push(...incoming);
    refresh();
  });
  action('process', async () => {
    if (!files.length) throw new Error(t('Добавьте изображения'));
    busy = true;
    clearResults();
    try {
      const pdf = await PDFDocument.create();
      plainMetadata(pdf);
      const margin = (number('pdf-margin', 0, 50) * 72) / 25.4;
      for (let i = 0; i < files.length; i++) {
        await yieldUI();
        status(t(`Создаём страницу ${i + 1} из ${files.length}…`));
        const image = await loadImage(files[i]);
        const c = newCanvas(image.naturalWidth, image.naturalHeight);
        c.getContext('2d')!.drawImage(image, 0, 0);
        const jpeg = files[i].type !== 'image/png';
        const encoded = await toBlob(c, jpeg ? 'image/jpeg' : 'image/png', 0.92);
        const embedded = jpeg
          ? await pdf.embedJpg(await encoded.arrayBuffer())
          : await pdf.embedPng(await encoded.arrayBuffer());
        const original = value('pdf-size') === 'original';
        const landscape = value('pdf-orientation') === 'landscape';
        const w = original ? c.width * 0.75 : landscape ? 841.89 : 595.28;
        const h = original ? c.height * 0.75 : landscape ? 595.28 : 841.89;
        const m = original ? 0 : margin;
        const scale = Math.min((w - 2 * m) / c.width, (h - 2 * m) / c.height);
        const dw = c.width * scale,
          dh = c.height * scale;
        pdf
          .addPage([w, h])
          .drawImage(embedded, { x: (w - dw) / 2, y: (h - dh) / 2, width: dw, height: dh });
        c.width = c.height = 0;
      }
      result(
        bytesBlob(await pdf.save(), 'application/pdf'),
        'toolsiano-images.pdf',
        t(`${files.length} страниц`),
      );
      status(t('PDF создан без отправки изображений на сервер.'));
    } finally {
      busy = false;
    }
  });
}
function pages() {
  return initPages();
}
function compressor() {
  const files: File[] = [];
  let busy = false;
  const refresh = () => fileList(files, refresh);
  upload('files', (incoming) => {
    if (busy) throw new Error(t('Дождитесь завершения обработки'));
    validateBatch([...files, ...incoming]);
    files.push(...incoming);
    refresh();
  });
  const modeChanged = () => {
    const mode = value('compress-mode');
    $('image-options').hidden = mode !== 'image' && mode !== 'render';
    $('dpi-field').hidden = mode !== 'render';
    $('target-field').hidden = mode !== 'image';
    $('compress-note').textContent =
      mode === 'render'
        ? t(
            'Каждая страница станет JPEG-изображением. Текстовый слой, ссылки, формы и векторная графика не сохранятся.',
          )
        : 'pdf' === mode
          ? t(
              'Пересохранение структуры PDF. Уменьшение не гарантируется. Это не полная очистка метаданных и не удаление скрытого содержимого.',
            )
          : 'zip' === mode
            ? t(
                'ZIP сжимает текст и объединяет файлы. Уже сжатые JPG, видео и PDF могут почти не уменьшиться.',
              )
            : t(
                'Результат — JPEG. Прозрачность заменяется белым фоном. Уменьшение размера не гарантируется.',
              );
  };
  $('compress-mode').addEventListener('change', modeChanged);
  action('process', async () => {
    if (!files.length) throw new Error(t('Добавьте файлы'));
    busy = true;
    clearResults();
    try {
      const mode = value('compress-mode');
      if (mode === 'zip') {
        const { default: JSZip } = await import('jszip');
        const zip = new JSZip();
        for (let i = 0; i < files.length; i++)
          zip.file(`${String(i + 1).padStart(2, '0')}-${files[i].name}`, files[i]);
        status(t('Создаём ZIP…'));
        result(
          await zip.generateAsync({
            type: 'blob',
            compression: 'STORE',
          }),
          'toolsiano-files.zip',
        );
        status(t('Архив готов'));
        return;
      }
      let done = 0;
      const errors: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        await yieldUI();
        status(t(`Обрабатываем ${i + 1} из ${files.length}: ${f.name}`));
        try {
          let blob: Blob, name: string;
          if (mode === 'image') {
            if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type))
              throw new Error(t('нужно изображение JPG, PNG или WebP'));
            const image = await loadImage(f);
            const ratio = Math.min(1, number('compress-width', 100, 12000) / image.naturalWidth);
            const c = newCanvas(
              Math.max(1, Math.round(image.naturalWidth * ratio)),
              Math.max(1, Math.round(image.naturalHeight * ratio)),
            );
            const base = newCanvas(image.naturalWidth, image.naturalHeight);
            const ctx = base.getContext('2d')!;
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, base.width, base.height);
            ctx.drawImage(image, 0, 0);
            const { default: pica } = await import('pica');
            await pica({ concurrency: 2, features: ['js', 'ww'] }).resize(base, c);
            const target = value('target-kb') ? number('target-kb', 10, 25000) : 0;
            const encoded = await encodeTarget(
              c,
              'image/jpeg',
              number('compress-quality', 10, 100) / 100,
              target,
            );
            blob = encoded.blob;
            if (!encoded.hit)
              errors.push(f.name + t(': целевой размер не достигнут; уменьшите ширину'));
            name = f.name.replace(/\.[^.]+$/, '') + '-compressed.jpg';
            base.width = base.height = c.width = c.height = 0;
          } else {
            if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf')
              throw new Error(t('нужен PDF'));
            const bytes = await f.arrayBuffer();
            const doc = await openPdf(bytes);
            blob =
              mode === 'render'
                ? await rasterPdf(
                    bytes,
                    number('pdf-dpi', 100, 200),
                    number('compress-quality', 10, 100) / 100,
                  )
                : bytesBlob(await doc.save({ useObjectStreams: true }), 'application/pdf');
            name = f.name.replace(/\.pdf$/i, '') + '-optimized.pdf';
          }
          const diff = (1 - blob.size / f.size) * 100;
          result(
            blob,
            name,
            t(
              `было ${size(f.size)} · ${diff >= 0 ? t('меньше на ') + diff.toFixed(1) + '%' : t('больше на ') + (-diff).toFixed(1) + '%'}`,
            ),
          );
          done++;
        } catch (e) {
          errors.push(f.name + ': ' + (e instanceof Error ? e.message : t('ошибка обработки')));
        }
      }
      status(
        t(
          `Готово файлов: ${done} из ${files.length}.${errors.length ? '\n' + errors.join('\n') : ''}`,
        ),
        errors.length > 0,
      );
    } finally {
      busy = false;
    }
  });
}
async function rasterPdf(bytes: ArrayBuffer, dpi: number, quality: number) {
  const loadingTask = await renderPdf(new Uint8Array(bytes.slice(0)));
  const input = await loadingTask.promise;
  try {
    const out = await PDFDocument.create();
    plainMetadata(out);
    for (let i = 1; i <= input.numPages; i++) {
      await yieldUI();
      const page = await input.getPage(i);
      const viewport = page.getViewport({ scale: dpi / 72 });
      const c = newCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = c.getContext('2d')!;
      await page.render({ canvasContext: ctx, canvas: c, viewport, background: '#ffffff' }).promise;
      const image = await out.embedJpg(
        await (await toBlob(c, 'image/jpeg', quality)).arrayBuffer(),
      );
      out.addPage([(viewport.width * 72) / dpi, (viewport.height * 72) / dpi]).drawImage(image, {
        x: 0,
        y: 0,
        width: (viewport.width * 72) / dpi,
        height: (viewport.height * 72) / dpi,
      });
      c.width = c.height = 0;
      page.cleanup();
    }
    return bytesBlob(await out.save(), 'application/pdf');
  } finally {
    await loadingTask.destroy();
  }
}
