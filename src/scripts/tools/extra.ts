import { t } from '../../lib/i18n.ts';
import {
  $,
  value,
  number,
  checked,
  status,
  action,
  upload,
  loadImage,
  toBlob,
  clearResults,
  result,
  copy,
  bytesBlob,
} from '../../lib/ui.ts';
import { canvas, limits, pageRange, yieldUI } from '../../lib/resources.ts';
import { initWatermark, drawMark } from '../../lib/watermark.ts';
import { fallbackFilter } from '../../lib/canvas-filters.ts';
export async function init(slug: string) {
  let file: File | undefined;
  let preview: HTMLImageElement | undefined;
  let pdfPreview: HTMLCanvasElement | undefined;
  let previewPage = 1,
    previewCount = 1;
  const watermark = slug === 'pdf-watermark' ? initWatermark(updateMarkPreview) : undefined;
  function updateMarkPreview() {
    if (!pdfPreview || !watermark) return;
    const c = canvas(pdfPreview.width, pdfPreview.height);
    c.getContext('2d')!.drawImage(pdfPreview, 0, 0);
    try {
      const mark = watermark.prepare(previewPage, previewCount);
      if (mark) drawMark(c, mark, watermark.options());
    } catch {
      /* Export and the preview button report missing or invalid controls. */
    }
    $('mark-preview').replaceChildren(c);
  }
  upload('files', async (files) => {
    if (files.length !== 1) throw new Error(t('Выберите один файл'));
    file = files[0];
    if (slug === 'pdf-watermark') {
      if (pdfPreview) pdfPreview.width = pdfPreview.height = 0;
      pdfPreview = undefined;
      $('mark-preview').replaceChildren();
    }
    if (document.getElementById('results')) clearResults();
    if (slug === 'scan-tools') {
      preview = await loadImage(file);
      const c = canvas(
        Math.min(800, preview.naturalWidth),
        Math.max(1, Math.round(preview.naturalHeight * Math.min(1, 800 / preview.naturalWidth))),
      );
      c.getContext('2d')!.drawImage(preview, 0, 0, c.width, c.height);
      $('scan-preview').replaceChildren(c);
    }
    if (slug === 'qr-reader') $<HTMLTextAreaElement>('qr-decoded').value = '';
    status(file.name);
  });
  if (slug === 'pdf-watermark') {
    $('mark-range').addEventListener('input', () => {
      if (pdfPreview) pdfPreview.width = pdfPreview.height = 0;
      pdfPreview = undefined;
      $('mark-preview').replaceChildren();
    });
    action('mark-preview-button', async () => {
      if (!file) throw new Error(t('Сначала выберите файл'));
      const { openPdf, pdfjs } = await import('./pdf.ts');
      const bytes = await file.arrayBuffer();
      const checkedDoc = await openPdf(bytes);
      previewCount = checkedDoc.getPageCount();
      previewPage = pageRange(value('mark-range'), previewCount)[0] + 1;
      watermark!.prepare(previewPage, previewCount);
      watermark!.options();
      const task = (await pdfjs()).getDocument({ data: new Uint8Array(bytes) });
      try {
        const doc = await task.promise,
          page = await doc.getPage(previewPage);
        const original = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({
          scale: Math.min(1.5, 900 / Math.max(original.width, original.height)),
        });
        const c = canvas(viewport.width, viewport.height);
        await page.render({
          canvas: c,
          canvasContext: c.getContext('2d')!,
          viewport,
          background: '#fff',
        }).promise;
        if (pdfPreview) pdfPreview.width = pdfPreview.height = 0;
        pdfPreview = c;
        updateMarkPreview();
        status(t('Предпросмотр первой выбранной страницы'));
      } finally {
        await task.destroy();
      }
    });
  }
  if (slug === 'qr-reader') {
    action('qr-copy', async () => {
      await copy(value('qr-decoded'));
      status(t('Текст скопирован'));
    });
    action('qr-read-clear', () => {
      file = undefined;
      $<HTMLTextAreaElement>('qr-decoded').value = '';
      status(t('Данные очищены'));
    });
  }
  action('process', async () => {
    if (!file) throw new Error(t('Сначала выберите файл'));
    if (slug === 'qr-reader') {
      const image = await loadImage(file);
      const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
      const c = canvas(image.naturalWidth * scale, image.naturalHeight * scale);
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(image, 0, 0, c.width, c.height);
      const { default: jsQR } = await import('jsqr');
      const decoded = jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height, {
        inversionAttempts: 'attemptBoth',
      });
      c.width = c.height = 0;
      if (!decoded)
        throw new Error(
          t('QR-код не найден. Обрежьте изображение вокруг кода или выберите более чёткое фото.'),
        );
      $<HTMLTextAreaElement>('qr-decoded').value = decoded.data;
      status(t('QR-код прочитан. Ссылка не открывалась.'));
      return;
    }
    clearResults();
    if (slug === 'scan-tools') {
      const image = preview || (await loadImage(file));
      const trim = number('scan-trim', 0, 30) / 100;
      const sw = image.naturalWidth * (1 - 2 * trim),
        sh = image.naturalHeight * (1 - 2 * trim);
      const c = canvas(sw, sh),
        ctx = c.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.translate(c.width / 2, c.height / 2);
      ctx.rotate((number('scan-angle', -15, 15) * Math.PI) / 180);
      const filter = `contrast(${number('scan-contrast', 50, 250) / 100}) brightness(${number('scan-brightness', 50, 180) / 100}) ${checked('scan-gray') ? 'grayscale(1)' : ''}`;
      const nativeFilter = 'filter' in ctx;
      if (nativeFilter) ctx.filter = filter;
      ctx.drawImage(
        image,
        image.naturalWidth * trim,
        image.naturalHeight * trim,
        sw,
        sh,
        -c.width / 2,
        -c.height / 2,
        c.width,
        c.height,
      );
      if (!nativeFilter) fallbackFilter(c, filter);
      result(await toBlob(c, 'image/jpeg', 0.92), 'toolsiano-scan.jpg');
      const ratio = Math.min(1, 800 / c.width);
      const thumb = canvas(c.width * ratio, c.height * ratio);
      thumb.getContext('2d')!.drawImage(c, 0, 0, thumb.width, thumb.height);
      $('scan-preview').replaceChildren(thumb);
      c.width = c.height = 0;
      status(t('Скан подготовлен. Проверьте читаемость и края.'));
      return;
    }
    const { openPdf, pdfjs } = await import('./pdf.ts');
    const bytes = await file.arrayBuffer();
    if (slug === 'pdf-watermark') {
      const { watermarkPage } = await import('../../lib/pdf-watermark.ts');
      const doc = await openPdf(bytes);
      const indices = pageRange(value('mark-range'), doc.getPageCount());
      const options = watermark!.options();
      let reusable: Awaited<ReturnType<typeof doc.embedPng>> | undefined;
      for (const index of indices) {
        const page = doc.getPage(index);
        const unique = value('wm-type') === 'text' && checked('mark-pages');
        if (!reusable || unique) {
          const mark = watermark!.prepare(index + 1, doc.getPageCount())!;
          reusable = await doc.embedPng(await (await toBlob(mark)).arrayBuffer());
          if (value('wm-type') === 'text') mark.width = mark.height = 0;
        }
        watermarkPage(page, reusable, options);
        await yieldUI();
      }
      result(bytesBlob(await doc.save(), 'application/pdf'), 'toolsiano-watermarked.pdf');
      status(t('Водяной знак добавлен. Исходный файл не изменён.'));
      return;
    }
    const lib = await pdfjs();
    const task = lib.getDocument({ data: new Uint8Array(bytes) });
    try {
      const doc = await task.promise;
      if (doc.numPages > limits().pages)
        throw new Error(t('Лимит страниц для этого устройства превышен'));
      const indices = pageRange(value('export-range'), doc.numPages);
      const format = value('export-format');
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      let total = 0;
      const texts: string[] = [];
      for (let i = 0; i < indices.length; i++) {
        const index = indices[i];
        status(t(`Экспорт страницы ${i + 1} из ${indices.length}…`));
        const page = await doc.getPage(index + 1);
        if (format === 'text') {
          const content = await page.getTextContent();
          texts.push(
            content.items
              .map((item) =>
                'str' in item ? item.str + ('hasEOL' in item && item.hasEOL ? '\n' : ' ') : '',
              )
              .join(''),
          );
        } else {
          const viewport = page.getViewport({ scale: number('export-dpi', 100, 200) / 72 });
          const c = canvas(viewport.width, viewport.height);
          await page.render({
            canvas: c,
            canvasContext: c.getContext('2d')!,
            viewport,
            background: '#fff',
          }).promise;
          const blob = await toBlob(c, format, 0.9);
          total += blob.size;
          if (total > 100 * 1024 * 1024)
            throw new Error(t('Результат больше 100 МБ. Экспортируйте меньший диапазон страниц.'));
          const name = `page-${index + 1}.${format === 'image/png' ? 'png' : 'jpg'}`;
          if (indices.length === 1) result(blob, name);
          else zip.file(name, blob);
          c.width = c.height = 0;
        }
        page.cleanup();
        await yieldUI();
      }
      if (format === 'text') {
        const txt = texts.join('\n\n');
        if (!txt.trim())
          throw new Error(t('Текстовый слой не найден. Для такого документа нужен OCR.'));
        result(new Blob([txt], { type: 'text/plain;charset=utf-8' }), 'toolsiano-text.txt');
      } else if (indices.length > 1)
        result(
          await zip.generateAsync({ type: 'blob', compression: 'STORE' }),
          'toolsiano-pdf-images.zip',
        );
      status(t('Экспорт завершён'));
    } finally {
      await task.destroy();
    }
  });
}
