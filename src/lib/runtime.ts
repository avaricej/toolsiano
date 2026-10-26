export function isDesktop() {
  return typeof document !== 'undefined' && document.documentElement.dataset.runtime === 'desktop';
}

export function preferredDesktopLocale(
  saved: string | null,
  language: string,
  installer: string | null = null,
) {
  if (saved === 'ru' || saved === 'en') return saved;
  if (installer === 'ru' || installer === 'en') return installer;
  return /^ru(?:-|$)/i.test(language) ? 'ru' : 'en';
}

export function safeFilename(name: string) {
  return (
    name
      .split(/[/\\]/)
      .pop()!
      .replace(/[<>:"|?*\x00-\x1f]/g, '_')
      .slice(0, 200) || 'toolsiano-result'
  );
}
