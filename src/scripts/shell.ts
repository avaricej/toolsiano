import { initOffline } from './offline.ts';
import { t } from '../lib/i18n.ts';
import { isDesktop } from '../lib/runtime.ts';
import { bugReportUrl } from '../lib/feedback.ts';
import { locale } from '../lib/i18n.ts';
document.querySelectorAll<HTMLAnchorElement>('a[data-bug-report]').forEach(anchor => {
  anchor.href = bugReportUrl(anchor.dataset.version || '',
    document.querySelector<HTMLElement>('[data-tool]')?.dataset.tool, locale(), isDesktop());
});
const toast = document.getElementById('toast')!;
let toastTimer: ReturnType<typeof setTimeout>;
export function notify(message: string) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.hidden = true), 6000);
}
const themeMode = document.getElementById('theme-mode') as HTMLSelectElement | null;
function updateThemeControl() {
  if (themeMode) themeMode.value = document.documentElement.dataset.themePreference || 'system';
}
updateThemeControl();
document.addEventListener('toolsiano-theme-applied', updateThemeControl);
themeMode?.addEventListener('change', () => {
  const theme = themeMode.value;
  if (!['system', 'light', 'dark'].includes(theme)) return;
  document.documentElement.dataset.themePreference = theme;
  document.dispatchEvent(new Event('toolsiano-theme-change'));
  try {
    localStorage.setItem('toolsiano-theme', theme);
  } catch {
    notify(t('Тема изменена, но браузер запретил её сохранение'));
  }
});
const menu = document.getElementById('menu-toggle');
const sidebar = document.getElementById('sidebar')!;
const mobile = matchMedia(isDesktop() ? '(max-width: 0px)' : '(max-width: 800px)');
function closeMenu(focus = false) {
  sidebar.classList.remove('open');
  sidebar.inert = mobile.matches;
  menu?.setAttribute('aria-expanded', 'false');
  menu?.setAttribute('aria-label', t('Открыть меню'));
  if (focus) menu?.focus();
}
closeMenu();
mobile.addEventListener('change', () => closeMenu(sidebar.contains(document.activeElement)));
menu?.addEventListener('click', () => {
  const open = sidebar.classList.toggle('open');
  sidebar.inert = mobile.matches && !open;
  menu.setAttribute('aria-expanded', String(open));
  menu.setAttribute('aria-label', open ? t('Закрыть меню') : t('Открыть меню'));
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sidebar.classList.contains('open')) closeMenu(true);
  if (e.key === 'Tab' && mobile.matches && sidebar.classList.contains('open')) {
    const links = [...sidebar.querySelectorAll<HTMLElement>('a[href],button:not([disabled])')];
    const first = links[0],
      last = links[links.length - 1],
      active = document.activeElement;
    if (active === menu || (!e.shiftKey && active === last) || (e.shiftKey && active === first)) {
      e.preventDefault();
      (active === menu ? (e.shiftKey ? last : first) : menu)?.focus();
    }
  }
  if (
    e.key === '/' &&
    !e.ctrlKey &&
    !e.metaKey &&
    !e.altKey &&
    !(e.target instanceof HTMLInputElement) &&
    !(e.target instanceof HTMLTextAreaElement) &&
    !(e.target instanceof HTMLSelectElement) &&
    !(e.target instanceof HTMLElement && e.target.isContentEditable) &&
    !document.querySelector('dialog[open]')
  ) {
    const search = document.getElementById('tool-search');
    if (search) {
      e.preventDefault();
      search.focus();
    }
  }
});
document.addEventListener('click', (e) => {
  if (
    !menu?.contains(e.target as Node) &&
    !document.getElementById('sidebar')?.contains(e.target as Node)
  ) {
    closeMenu();
  }
});
const search = document.getElementById('tool-search') as HTMLInputElement | null;
let category = t('Все инструменты');
function filter() {
  let count = 0;
  document.querySelectorAll<HTMLElement>('.tool-card').forEach((card) => {
    const show =
      (category === t('Все инструменты') || card.dataset.category === category) &&
      card.dataset
        .search!.toLocaleLowerCase('ru')
        .includes((search?.value || '').trim().toLocaleLowerCase('ru'));
    card.hidden = !show;
    if (show) count++;
  });
  const empty = document.getElementById('empty-search');
  if (empty) empty.hidden = count > 0;
  const s = document.getElementById('search-status');
  if (s) s.textContent = t(`Найдено инструментов: ${count}`);
}
search?.addEventListener('input', filter);
document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((b) =>
  b.addEventListener('click', () => {
    category = b.dataset.filter!;
    document.querySelectorAll('[data-filter]').forEach((x) => {
      x.classList.toggle('active', x === b);
      x.setAttribute('aria-pressed', String(x === b));
    });
    filter();
  }),
);

const supportDialog = document.getElementById('support-dialog') as HTMLDialogElement | null;
document.querySelectorAll<HTMLButtonElement>('[data-support-open]').forEach((button) => {
  button.addEventListener('click', () => {
    closeMenu();
    if (supportDialog && !supportDialog.open) supportDialog.showModal();
  });
});
document.getElementById('support-close')?.addEventListener('click', () => supportDialog?.close());

if (isDesktop()) {
  void import('./desktop.ts').then(({ initDesktop }) => initDesktop(notify));
} else {
  initOffline(notify);
}
