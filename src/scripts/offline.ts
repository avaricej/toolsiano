import { t, locale } from '../lib/i18n.ts';
const PREFIX = 'toolsiano-';
const MARKER = '/__toolsiano_offline__';
export function initOffline(notify: (message: string) => void) {
  const dialog = document.getElementById('offline-dialog') as HTMLDialogElement;
  const open = document.getElementById('offline-install') as HTMLButtonElement;
  const save = document.getElementById('offline-save') as HTMLButtonElement;
  const remove = document.getElementById('offline-remove') as HTMLButtonElement;
  const state = document.getElementById('offline-state')!;
  const progress = document.getElementById('offline-progress') as HTMLProgressElement;
  let busy = false;
  async function refresh() {
    try {
      if (!('caches' in window) || !('serviceWorker' in navigator)) throw new Error();
      let saved = false,
        savedAt = 0;
      for (const name of await caches.keys()) {
        if (!name.startsWith(PREFIX)) continue;
        const cache = await caches.open(name),
          marker = await cache.match(MARKER);
        if (marker) {
          saved = true;
          savedAt = Math.max(savedAt, (await marker.json()).savedAt || 0);
        } else if (
          !name.includes('-pending-') &&
          (await cache.match('/build-info.json')) &&
          (await cache.match('/en/')) &&
          (await cache.match('/ru/'))
        )
          saved = true;
      }
      state.textContent = saved
        ? t('Офлайн-копия сохранена в этом браузере.')
        : t('Офлайн-копия ещё не сохранена.');
      if (savedAt)
        state.textContent +=
          ' ' +
          t('Дата сохранения: ') +
          new Date(savedAt).toLocaleString(locale() === 'en' ? 'en-GB' : 'ru-RU');
      save.textContent = saved ? t('Обновить офлайн-копию') : t('Сохранить офлайн-копию');
      save.disabled = busy;
      remove.disabled = busy || !saved;
    } catch {
      state.textContent = t(
        'Браузер запретил доступ к офлайн-хранилищу. Онлайн-инструменты доступны.',
      );
      save.disabled = remove.disabled = true;
    }
  }
  open.addEventListener('click', () => {
    dialog.showModal();
    if (!busy) void refresh();
  });
  document.getElementById('offline-close')!.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => open.focus({ preventScroll: true }));
  save.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    save.disabled = remove.disabled = true;
    progress.hidden = false;
    progress.value = 0;
    state.textContent = t('Сохраняем офлайн-копию…');
    let message = '';
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      });
      await reg.update();
      const worker = reg.installing || reg.waiting || reg.active;
      if (!worker) throw new Error(t('Не удалось запустить офлайн-режим'));
      if (worker.state !== 'activated')
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            cleanup();
            reject(new Error(t('Не удалось активировать офлайн-режим')));
          }, 30000);
          const changed = () => {
            if (worker.state === 'activated') {
              cleanup();
              resolve();
            } else if (worker.state === 'redundant') {
              cleanup();
              reject(new Error(t('Не удалось активировать офлайн-режим')));
            }
          };
          function cleanup() {
            clearTimeout(timeout);
            worker!.removeEventListener('statechange', changed);
          }
          worker.addEventListener('statechange', changed);
          changed();
        });
      const channel = new MessageChannel();
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          channel.port1.close();
          reject(
            new Error(t('Сохранение занимает слишком долго. Проверьте состояние копии позже.')),
          );
        }, 180000);
        channel.port1.onmessage = (e) => {
          if (e.data.total) {
            progress.max = e.data.total;
            progress.value = e.data.progress;
            return;
          }
          clearTimeout(timeout);
          channel.port1.close();
          e.data.ok
            ? resolve()
            : reject(
                new Error(
                  t(
                    'Не удалось сохранить новую копию. Предыдущая рабочая копия сохранена, если она была.',
                  ),
                ),
              );
        };
        worker.postMessage({ type: 'CACHE_APP', progress: true }, [channel.port2]);
      });
      message = t(
        'Офлайн-копия сохранена в браузере. Страницы и инструменты доступны без интернета.',
      );
    } catch (e) {
      message = e instanceof Error ? e.message : t('Не удалось запустить офлайн-режим');
    } finally {
      busy = false;
      progress.hidden = true;
      await refresh();
      notify(message);
      if (dialog.open) state.textContent += ' ' + message;
    }
  });
  remove.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    save.disabled = remove.disabled = true;
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        const worker = reg.active || reg.waiting || reg.installing;
        if (worker && new URL(worker.scriptURL).pathname === '/sw.js') await reg.unregister();
      }
      for (const key of await caches.keys()) if (key.startsWith(PREFIX)) await caches.delete(key);
      notify(t('Офлайн-копия удалена. Настройка темы сохранена.'));
    } catch {
      notify(
        t(
          'Не удалось полностью удалить офлайн-копию. Проверьте данные сайта в настройках браузера.',
        ),
      );
    } finally {
      busy = false;
      await refresh();
    }
  });
}
