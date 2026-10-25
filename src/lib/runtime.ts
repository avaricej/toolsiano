export function isDesktop() {
  return typeof document !== 'undefined' && document.documentElement.dataset.runtime === 'desktop';
}

export function preferredDesktopLocale(saved: string | null, language: string) {
  return saved === 'ru' || saved === 'en' ? saved : /^ru(?:-|$)/i.test(language) ? 'ru' : 'en';
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
