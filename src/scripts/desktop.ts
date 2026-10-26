import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { openUrl } from '@tauri-apps/plugin-opener';
import { t } from '../lib/i18n';
import { safeFilename } from '../lib/runtime';
import { resultLimit } from '../lib/resources';
import { isSupportEmailUrl } from '../lib/feedback';

let saving = false;
export async function saveDesktopFile(blob: Blob, name: string) {
  if (saving) return;
  if (blob.size > resultLimit())
    throw new Error(
      t(
        resultLimit() < 100 * 1024 * 1024
          ? 'Файл превышает лимит сохранения 50 МБ.'
          : 'Файл превышает лимит сохранения 100 МБ.',
      ),
    );
  saving = true;
  try {
    const path = await save({ title: t('Сохранить результат'), defaultPath: safeFilename(name) });
    if (!path) return;
    // The dialog grants temporary access to this selected file only.
    await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
  } catch {
    throw new Error(t('Не удалось сохранить файл. Проверьте доступ и свободное место.'));
  } finally {
    saving = false;
  }
}

export function initDesktop(notify: (message: string) => void) {
  const toggle = document.getElementById('desktop-sidebar-toggle');
  function updateNavigation() {
    const compact = document.documentElement.classList.contains('desktop-sidebar-compact');
    toggle?.setAttribute('aria-expanded', String(!compact));
    toggle?.setAttribute('aria-label', t(compact ? 'Развернуть навигацию' : 'Свернуть навигацию'));
    document.getElementById('sidebar')!.inert = false;
  }
  updateNavigation();
  toggle?.addEventListener('click', () => {
    const compact = document.documentElement.classList.toggle('desktop-sidebar-compact');
    try {
      sessionStorage.setItem('toolsiano-sidebar', compact ? 'compact' : 'expanded');
    } catch {
      /* current page still works */
    }
    updateNavigation();
  });
  document.querySelectorAll<HTMLDetailsElement>('.desktop-settings').forEach((details) => {
    const controls = [
      ...details.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input,select,textarea'),
    ];
    const state = () =>
      controls
        .map((control) =>
          control instanceof HTMLInputElement && ['checkbox', 'radio'].includes(control.type)
            ? String(control.checked)
            : control.value,
        )
        .join('\u0001');
    const initial = state();
    const badge = document.createElement('span');
    badge.className = 'desktop-settings-changed';
    badge.textContent = t('Изменено');
    badge.hidden = true;
    details.querySelector('summary')!.append(badge);
    const changed = () => {
      badge.hidden = state() === initial;
    };
    details.addEventListener('input', changed);
    details.addEventListener('change', changed);
  });
  document.getElementById('language-switch')?.addEventListener('click', (event) => {
    const language = (event.currentTarget as HTMLAnchorElement).lang;
    if (language === 'ru' || language === 'en') {
      try {
        localStorage.setItem('toolsiano-language', language);
      } catch {
        /* session choice still works */
      }
    }
  });
  document.addEventListener('click', async (event) => {
    const anchor = (event.target as Element).closest?.('a[href]') as HTMLAnchorElement | null;
    if (!anchor || event.defaultPrevented) return;
    const url = new URL(anchor.href);
    if (url.origin === location.origin && !anchor.hasAttribute('download')) return;
    if (url.origin === location.origin && anchor.hasAttribute('download')) {
      event.preventDefault();
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error();
        await saveDesktopFile(
          await response.blob(),
          anchor.download || url.pathname.split('/').pop()!,
        );
      } catch (error) {
        notify(
          error instanceof Error
            ? error.message
            : t('Не удалось сохранить файл. Проверьте доступ и свободное место.'),
        );
      }
      return;
    }
    event.preventDefault();
    if (url.protocol !== 'https:' && !isSupportEmailUrl(url)) return;
    try {
      await openUrl(url.href);
    } catch {
      notify(t('Не удалось открыть ссылку в системном браузере.'));
    }
  });
}
