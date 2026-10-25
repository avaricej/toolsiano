import { $, value, number, checked, loadImage, status } from './ui.ts';
import { canvas, imageDimensions } from './resources.ts';
import { t } from './i18n.ts';

export type MarkOptions = {
  size: number;
  opacity: number;
  margin: number;
  angle: number;
  position: string;
  repeat: boolean;
};
export function placements(width: number, height: number, ratio: number, o: MarkOptions) {
  const margin = (Math.min(width, height) * o.margin) / 100;
  let w = (width * o.size) / 100,
    h = w / ratio;
  const a = (o.angle * Math.PI) / 180;
  const bw = Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a));
  const bh = Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a));
  const fit = Math.min(1, (width - 2 * margin) / bw, (height - 2 * margin) / bh);
  w *= fit;
  h *= fit;
  const boxW = bw * fit,
    boxH = bh * fit;
  if (o.repeat) {
    // Fixed cell minima keep work bounded even for very narrow logos.
    const dx = Math.max(boxW + width * 0.06, width / 12);
    const dy = Math.max(boxH + height * 0.06, height / 12);
    const points = [];
    for (let y = margin + boxH / 2; y <= height - margin - boxH / 2 + 0.001; y += dy)
      for (let x = margin + boxW / 2; x <= width - margin - boxW / 2 + 0.001; x += dx)
        points.push({ x, y, w, h });
    return points;
  }
  const [col, row] = o.position.split('-').map(Number);
  return [
    {
      x: margin + boxW / 2 + ((width - 2 * margin - boxW) * col) / 2,
      y: margin + boxH / 2 + ((height - 2 * margin - boxH) * row) / 2,
      w,
      h,
    },
  ];
}
export function drawMark(target: HTMLCanvasElement, mark: HTMLCanvasElement, o: MarkOptions) {
  const ctx = target.getContext('2d')!;
  ctx.save();
  ctx.globalAlpha = o.opacity / 100;
  for (const p of placements(target.width, target.height, mark.width / mark.height, o)) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate((o.angle * Math.PI) / 180);
    ctx.drawImage(mark, -p.w / 2, -p.h / 2, p.w, p.h);
    ctx.restore();
  }
  ctx.restore();
}
export function initWatermark(onChange: () => void) {
  let logo: HTMLCanvasElement | undefined;
  let revision = 0;
  const update = () => {
    const type = value('wm-type');
    $('wm-text-fields').hidden = type !== 'text';
    $('wm-image-fields').hidden = type !== 'image';
    $('wm-settings').hidden = type === 'none';
    onChange();
  };
  $('watermark-controls').addEventListener('input', (e) => {
    if ((e.target as HTMLElement).id !== 'wm-file') update();
  });
  $('wm-remove').addEventListener('click', () => {
    revision++;
    if (logo) logo.width = logo.height = 0;
    logo = undefined;
    $('wm-file-name').textContent = '';
    $<HTMLInputElement>('wm-file').value = '';
    onChange();
  });
  $('wm-file').addEventListener('change', async () => {
    const input = $<HTMLInputElement>('wm-file');
    const file = input.files?.[0];
    if (!file) return;
    const ticket = ++revision;
    // Invalidate an earlier logo immediately; failed replacements must not export stale data.
    if (logo) logo.width = logo.height = 0;
    logo = undefined;
    $('wm-file-name').textContent = '';
    onChange();
    try {
      if (
        !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
        file.size > 5 * 1024 * 1024
      )
        throw new Error(t('Логотип: выберите PNG, JPEG или WebP размером до 5 МБ'));
      const dims = await imageDimensions(file);
      if (!dims || dims[0] * dims[1] > 2000000)
        throw new Error(t('Логотип должен содержать не больше 2 мегапикселей'));
      const image = await loadImage(file);
      if (image.naturalWidth * image.naturalHeight > 2000000)
        throw new Error(t('Логотип должен содержать не больше 2 мегапикселей'));
      if (ticket !== revision) return;
      logo = canvas(image.naturalWidth, image.naturalHeight);
      logo.getContext('2d')!.drawImage(image, 0, 0);
      $('wm-file-name').textContent = file.name;
      status('');
      onChange();
    } catch (e) {
      if (ticket === revision)
        status(e instanceof Error ? e.message : t('Ошибка чтения файла'), true);
    } finally {
      input.value = '';
    }
  });
  return {
    options(): MarkOptions {
      return {
        size: number('wm-size', 5, 90),
        opacity: number('wm-opacity', 5, 100),
        margin: number('wm-margin', 0, 20),
        angle: number('wm-angle', -180, 180),
        position: value('wm-position'),
        repeat: checked('wm-repeat'),
      };
    },
    prepare(page?: number, count?: number): HTMLCanvasElement | undefined {
      const type = value('wm-type');
      if (type === 'none') return;
      if (type === 'image') {
        if (!logo) throw new Error(t('Сначала выберите логотип'));
        return logo;
      }
      const parts = [value('watermark').trim()];
      if (document.getElementById('mark-date') && checked('mark-date'))
        parts.push(
          new Date().toLocaleDateString(document.documentElement.lang === 'en' ? 'en-GB' : 'ru-RU'),
        );
      if (document.getElementById('mark-pages') && checked('mark-pages'))
        parts.push(`${page} / ${count}`);
      const label = parts.filter(Boolean).join(' · ');
      if (!label) throw new Error(t('Введите текст водяного знака'));
      const c = canvas(1800, 140),
        ctx = c.getContext('2d')!;
      ctx.font = '600 100px sans-serif';
      c.width = Math.max(1, Math.ceil(Math.min(1800, ctx.measureText(label).width + 24)));
      ctx.font = '600 100px sans-serif';
      ctx.fillStyle = value('wm-color');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, c.width / 2, 70, c.width - 16);
      return c;
    },
  };
}
