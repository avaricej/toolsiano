import { t } from '../lib/i18n.ts';
import { status, resultActions } from '../lib/ui.ts';
const slug = document.querySelector<HTMLElement>('[data-tool]')?.dataset.tool;
async function init() {
  switch (slug) {
    case 'image-tools':
    case 'meta-remover':
      return (await import('./tools/images.ts')).init(slug);
    case 'pdf':
    case 'page-replacer':
    case 'file-compressor':
      return (await import('./tools/pdf.ts')).init(slug);
    case 'password':
    case 'qr':
      return (await import('./tools/generators.ts')).init(slug);
    case 'qr-reader':
    case 'scan-tools':
    case 'pdf-export':
    case 'pdf-watermark':
      return (await import('./tools/extra.ts')).init(slug);
  }
}
init()
  .then(() => {
    resultActions();
    const controls = document.getElementById('tool-controls') as HTMLFieldSetElement;
    controls.disabled = false;
    document.getElementById('tool-loading')!.hidden = true;
    document.querySelector<HTMLElement>('[data-tool]')!.dataset.ready = 'true';
  })
  .catch((e) => {
    document.getElementById('tool-loading')!.hidden = true;
    status(t('Не удалось загрузить инструмент. ') + (e instanceof Error ? e.message : ''), true);
  });
