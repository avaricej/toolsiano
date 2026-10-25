import { t } from '../../lib/i18n.ts';
import {
  $,
  value,
  checked,
  number,
  status,
  upload,
  fileList,
  loadImage,
  toBlob,
  action,
  clearResults,
  result,
  text,
  size,
  bytesBlob,
} from '../../lib/ui.ts';
import { canvas, validateBatch, yieldUI } from '../../lib/resources.ts';
import { stripJpeg, stripPng } from '../../lib/image-processing.ts';
import { initWatermark, drawMark } from '../../lib/watermark.ts';
import { fallbackFilter, whiteBackground } from '../../lib/canvas-filters.ts';
export function init(slug: string) {
  let files: File[] = [];
  let original: HTMLCanvasElement | null = null;
  let edited: HTMLCanvasElement | null = null;
  const watermark = slug === 'image-tools' ? initWatermark(() => updatePreview()) : undefined;
  function updatePreview() {
    if (!original || !watermark) return;
    try {
      const crop = value('image-crop');
      let sw = original.width,
        sh = original.height;
      if (crop !== 'none') {
        const r = Number(crop);
        if (sw / sh > r) sw = sh * r;
        else sh = sw / r;
      }
      let w = sw,
        h = sh;
      if (value('image-width')) {
        w = number('image-width', 1, 12000);
        if (checked('image-ratio')) h = (w * sh) / sw;
      }
      if (value('image-height') && (!checked('image-ratio') || !value('image-width'))) {
        h = number('image-height', 1, 12000);
        if (checked('image-ratio')) w = (h * sw) / sh;
      }
      const scale = Math.min(1, 900 / Math.max(w, h));
      w = Math.max(1, w * scale);
      h = Math.max(1, h * scale);
      const rotation = Number(value('image-rotate'));
      const c = canvas(rotation % 180 ? h : w, rotation % 180 ? w : h),
        ctx = c.getContext('2d')!;
      const nativeFilter = 'filter' in ctx;
      ctx.translate(c.width / 2, c.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      if (nativeFilter) ctx.filter = value('image-filter');
      ctx.drawImage(
        original,
        (original.width - sw) / 2,
        (original.height - sh) / 2,
        sw,
        sh,
        -w / 2,
        -h / 2,
        w,
        h,
      );
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (nativeFilter) ctx.filter = 'none';
      else fallbackFilter(c, value('image-filter'));
      if (value('image-format') === 'image/jpeg') whiteBackground(c);
      try {
        const mark = watermark.prepare();
        if (mark) drawMark(c, mark, watermark.options());
      } catch {
        /* Show the unmarked image while the text or logo is missing. */
      }
      edited = c;
      if (!checked('image-compare')) $('image-preview').replaceChildren(c);
      $('compare-control').hidden = false;
    } catch {
      /* Incomplete controls leave the last valid preview; export reports validation errors. */
    }
  }
  let previewVersion = 0;
  const refresh = () =>
    fileList(files, () => {
      refresh();
      void showFirst().catch((e) =>
        status(e instanceof Error ? e.message : t('Ошибка чтения файла'), true),
      );
    });
  async function showFirst(resetSizes = false) {
    const version = ++previewVersion;
    if (original) original.width = original.height = 0;
    if (edited) edited.width = edited.height = 0;
    original = edited = null;
    $('image-preview').replaceChildren();
    $('metadata').replaceChildren();
    if (slug === 'image-tools') $('compare-control').hidden = true;
    if (!files.length) return;
    const firstFile = files[0];
    const image = await loadImage(firstFile);
    if (version !== previewVersion || files[0] !== firstFile) return;
    const preview = canvas(
      Math.max(
        1,
        Math.round(
          image.naturalWidth * Math.min(1, 900 / Math.max(image.naturalWidth, image.naturalHeight)),
        ),
      ),
      Math.max(
        1,
        Math.round(
          image.naturalHeight *
            Math.min(1, 900 / Math.max(image.naturalWidth, image.naturalHeight)),
        ),
      ),
    );
    preview.getContext('2d')!.drawImage(image, 0, 0, preview.width, preview.height);
    original = preview;
    edited = null;
    $('image-preview').replaceChildren(preview);
    $('image-preview').className = 'preview-panel';
    if (slug === 'image-tools') {
      if (resetSizes) {
        $<HTMLInputElement>('image-width').value = '';
        $<HTMLInputElement>('image-height').value = '';
      }
      $('compare-control').hidden = true;
      updatePreview();
    } else {
      const exifr = await import('exifr');
      $('metadata').replaceChildren();
      for (const f of files) {
        let meta;
        try {
          meta = await exifr.parse(f);
        } catch {
          meta = null;
        }
        if (version !== previewVersion) return;
        const details = document.createElement('details');
        details.append(text('summary', f.name));
        const pre = text(
          'pre',
          meta
            ? JSON.stringify(meta, null, 2)
            : t('Читаемые EXIF-данные не найдены. Это не исключает другие метаданные.'),
        );
        pre.style.cssText = 'white-space:pre-wrap;font-size:11px;max-height:240px;overflow:auto';
        details.append(pre);
        $('metadata').append(details);
      }
    }
  }
  upload('files', async (incoming) => {
    validateBatch(incoming);
    if (incoming.some((f) => !['image/jpeg', 'image/png', 'image/webp'].includes(f.type)))
      throw new Error(t('Поддерживаются только JPG, PNG и WebP'));
    clearResults();
    files = incoming;
    refresh();
    await showFirst(true);
    status(t(`Выбрано файлов: ${files.length}`));
  });
  if (slug === 'image-tools') {
    document.querySelector('.control-panel')!.addEventListener('input', (e) => {
      if (!(e.target as HTMLElement).closest('#watermark-controls')) updatePreview();
    });
    $('image-quality').addEventListener(
      'input',
      () => ($('quality-value').textContent = value('image-quality') + '%'),
    );
    $('image-compare').addEventListener('change', () => {
      const c = checked('image-compare') ? original : edited;
      if (c) $('image-preview').replaceChildren(c);
    });
  }
  action('process', async () => {
    if (!files.length) throw new Error(t('Сначала выберите изображение'));
    clearResults();
    let done = 0;
    const errors: string[] = [];
    const { default: pica } = await import('pica');
    const resizer = pica({ concurrency: 2, features: ['js', 'ww'] });
    const mark = watermark?.prepare();
    const markOptions = mark ? watermark!.options() : undefined;
    for (let index = 0; index < files.length; index++) {
      const f = files[index];
      status(t(`Обрабатываем ${index + 1} из ${files.length}: ${f.name}`));
      await yieldUI();
      try {
        if (slug === 'meta-remover') {
          const exifr = await import('exifr');
          let orientation = 1;
          try {
            orientation = (await exifr.orientation(f)) || 1;
          } catch {}
          let blob: Blob, ext: string;
          if (f.type === 'image/jpeg' && orientation === 1) {
            blob = bytesBlob(stripJpeg(new Uint8Array(await f.arrayBuffer())), 'image/jpeg');
            ext = 'jpg';
          } else if (f.type === 'image/png' && orientation === 1) {
            blob = bytesBlob(stripPng(new Uint8Array(await f.arrayBuffer())), 'image/png');
            ext = 'png';
          } else {
            const image = await loadImage(f);
            const c = canvas(image.naturalWidth, image.naturalHeight);
            c.getContext('2d')!.drawImage(image, 0, 0);
            blob = await toBlob(c, f.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.95);
            ext = blob.type === 'image/jpeg' ? 'jpg' : 'png';
            c.width = c.height = 0;
          }
          result(
            blob,
            f.name.replace(/\.[^.]+$/, '') + '-clean.' + ext,
            t('Метаданные удалены; проверьте цвет и ориентацию'),
          );
          done++;
          continue;
        }
        const image = await loadImage(f);
        let sw = image.naturalWidth,
          sh = image.naturalHeight,
          sx = 0,
          sy = 0;
        const crop = value('image-crop');
        if (crop !== 'none') {
          const r = Number(crop);
          if (sw / sh > r) {
            const w = sh * r;
            sx = (sw - w) / 2;
            sw = w;
          } else {
            const h = sw / r;
            sy = (sh - h) / 2;
            sh = h;
          }
        }
        const iw = value('image-width'),
          ih = value('image-height');
        let w = iw ? number('image-width', 1, 12000) : Math.round(sw),
          h = ih ? number('image-height', 1, 12000) : Math.round(sh);
        if (checked('image-ratio')) {
          if (iw) h = Math.round((w * sh) / sw);
          else if (ih) w = Math.round((h * sw) / sh);
        }
        const base = canvas(sw, sh),
          resized = canvas(w, h);
        base.getContext('2d')!.drawImage(image, sx, sy, sw, sh, 0, 0, base.width, base.height);
        await resizer.resize(base, resized);
        const rotation = Number(value('image-rotate'));
        const out = canvas(rotation % 180 ? h : w, rotation % 180 ? w : h);
        const ctx = out.getContext('2d')!;
        const type = value('image-format');
        const nativeFilter = 'filter' in ctx;
        ctx.translate(out.width / 2, out.height / 2);
        ctx.rotate((rotation * Math.PI) / 180);
        if (nativeFilter) ctx.filter = value('image-filter');
        ctx.drawImage(resized, -w / 2, -h / 2);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        if (nativeFilter) ctx.filter = 'none';
        else fallbackFilter(out, value('image-filter'));
        if (type === 'image/jpeg') whiteBackground(out);
        if (mark && markOptions) drawMark(out, mark, markOptions);
        const blob = await toBlob(out, type, number('image-quality', 10, 100) / 100);
        const ext =
          blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/webp' ? 'webp' : 'png';
        result(
          blob,
          f.name.replace(/\.[^.]+$/, '') + '-edited.' + ext,
          `${out.width} × ${out.height} px`,
        );
        if (index === 0) {
          const ratio = Math.min(1, 900 / out.width);
          edited = canvas(Math.round(out.width * ratio), Math.round(out.height * ratio));
          edited.getContext('2d')!.drawImage(out, 0, 0, edited.width, edited.height);
          $('image-preview').replaceChildren(edited);
          $('compare-control').hidden = false;
          $<HTMLInputElement>('image-compare').checked = false;
        }
        base.width = base.height = resized.width = resized.height = out.width = out.height = 0;
        done++;
      } catch (e) {
        errors.push(f.name + ': ' + (e instanceof Error ? e.message : t('Ошибка обработки')));
      }
    }
    status(
      t(
        `Готово файлов: ${done} из ${files.length}.${errors.length ? '\n' + errors.join('\n') : ''}`,
      ),
      errors.length > 0,
    );
  });
}
