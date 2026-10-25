import { t } from '../../lib/i18n.ts';
import { PDFDocument, degrees } from 'pdf-lib';
import { pdfjs, openPdf, plainMetadata } from './pdf.ts';
import {
  $,
  value,
  status,
  action,
  upload,
  clearResults,
  result,
  text,
  bytesBlob,
} from '../../lib/ui.ts';
import { canvas, limits, validateBatch, pageRange, yieldUI } from '../../lib/resources.ts';
type Source = {
  doc: PDFDocument;
  file: File;
  reader?: any;
  task?: any;
};
type Entry = {
  source: Source;
  index: number;
  rotation: number;
};
export function initPages() {
  let entries: Entry[] = [];
  let queue = Promise.resolve();
  let observer: IntersectionObserver | null = null;
  let generation = 0;
  const sources = new Set<Source>();
  const releaseUnused = () => {
    for (const s of sources)
      if (!entries.some((e) => e.source === s)) {
        void s.task?.destroy();
        sources.delete(s);
      }
  };
  const render = () => {
    generation++;
    const version = generation;
    observer?.disconnect();
    $('page-list')
      .querySelectorAll('canvas')
      .forEach((c) => {
        c.width = c.height = 0;
      });
    $('page-list').replaceChildren();
    observer = new IntersectionObserver(
      (items) => {
        for (const item of items) {
          if (!item.isIntersecting) continue;
          observer?.unobserve(item.target);
          const tile = item.target as HTMLElement;
          const i = Number(tile.dataset.index);
          const entry = entries[i];
          queue = queue.then(async () => {
            if (version !== generation || !entry || !tile.isConnected) return;
            try {
              const source = entry.source;
              if (!source.reader) {
                const lib = await pdfjs();
                source.task = lib.getDocument({
                  data: new Uint8Array(await source.file.arrayBuffer()),
                });
                source.reader = await source.task.promise;
              }
              const page = await source.reader.getPage(entry.index + 1);
              const first = page.getViewport({ scale: 1 });
              const viewport = page.getViewport({
                scale: Math.min(0.5, 160 / first.width),
                rotation: (page.rotate + entry.rotation) % 360,
              });
              const c = canvas(viewport.width, viewport.height);
              await page.render({ canvas: c, canvasContext: c.getContext('2d')!, viewport })
                .promise;
              page.cleanup();
              if (version === generation && tile.isConnected)
                tile.querySelector('.page-preview')!.replaceChildren(c);
              else c.width = c.height = 0;
            } catch {
              if (tile.isConnected)
                tile.querySelector('.page-preview')!.textContent = t('Предпросмотр недоступен');
            }
          });
        }
      },
      { rootMargin: '100px' },
    );
    entries.forEach((entry, i) => {
      const tile = text('div', '', 'page-tile');
      tile.dataset.index = String(i);
      const preview = text('div', 'PDF', 'page-preview');
      tile.append(
        preview,
        text('strong', t(`Страница ${i + 1}`)),
        text('small', entry.source.file.name),
      );
      const actions = text('div', '', 'actions');
      const ops = [
        [
          '↑',
          t('Переместить выше'),
          () => {
            if (i > 0) [entries[i - 1], entries[i]] = [entries[i], entries[i - 1]];
          },
        ],
        [
          '↓',
          t('Переместить ниже'),
          () => {
            if (i < entries.length - 1) [entries[i + 1], entries[i]] = [entries[i], entries[i + 1]];
          },
        ],
        ['↻', t('Повернуть на 90 градусов'), () => (entry.rotation = (entry.rotation + 90) % 360)],
        ['×', t('Удалить страницу'), () => entries.splice(i, 1)],
      ] as const;
      for (const [label, title, fn] of ops) {
        const button = text('button', label) as HTMLButtonElement;
        button.type = 'button';
        button.setAttribute('aria-label', title + ' ' + (i + 1));
        button.addEventListener('click', () => {
          fn();
          releaseUnused();
          render();
        });
        actions.append(button);
      }
      tile.append(actions);
      $('page-list').append(tile);
      observer!.observe(tile);
    });
  };
  upload('files', async (files) => {
    validateBatch([...Array.from(sources).map((s) => s.file), ...files]);
    for (const file of files) {
      const doc = await openPdf(await file.arrayBuffer());
      if (entries.length + doc.getPageCount() > limits().pages)
        throw new Error(t('Лимит страниц для этого устройства превышен'));
      const source = { doc, file };
      sources.add(source);
      entries.push(
        ...Array.from({ length: doc.getPageCount() }, (_, index) => ({
          source,
          index,
          rotation: 0,
        })),
      );
    }
    render();
    status(t(`Добавлено страниц: ${entries.length}. Измените порядок или сохраните PDF.`));
  });
  const selected = () => pageRange(value('page-range'), entries.length).map((i) => entries[i]);
  const create = async (list: Entry[]) => {
    const out = await PDFDocument.create();
    plainMetadata(out);
    for (const entry of list) {
      const [p] = await out.copyPages(entry.source.doc, [entry.index]);
      p.setRotation(degrees((p.getRotation().angle + entry.rotation) % 360));
      out.addPage(p);
      await yieldUI();
    }
    return bytesBlob(await out.save(), 'application/pdf');
  };
  action('process', async () => {
    if (!entries.length) throw new Error(t('Добавьте хотя бы одну страницу'));
    const list = selected();
    clearResults();
    result(await create(list), 'toolsiano-pages.pdf', t(`${list.length} страниц`));
    status(
      t(
        'Готово. Закладки, подписи и интерактивные формы могут не сохраняться при копировании страниц.',
      ),
    );
  });
  action('split-pdf', async () => {
    if (!entries.length) throw new Error(t('Сначала добавьте PDF'));
    const list = selected();
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    for (let i = 0; i < list.length; i++) zip.file(`page-${i + 1}.pdf`, await create([list[i]]));
    clearResults();
    result(await zip.generateAsync({ type: 'blob', compression: 'STORE' }), 'toolsiano-pages.zip');
    status(t('Отдельные страницы упакованы в ZIP.'));
  });
  action('clear-pages', () => {
    entries = [];
    releaseUnused();
    render();
    clearResults();
    status(t('Рабочее пространство очищено'));
  });
  addEventListener(
    'pagehide',
    () => {
      observer?.disconnect();
      for (const s of sources) void s.task?.destroy();
    },
    { once: true },
  );
}
