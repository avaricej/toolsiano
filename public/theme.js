(() => {
  const root = document.documentElement;
  const system = matchMedia('(prefers-color-scheme: dark)');
  const preference = (value) => (['light', 'dark'].includes(value) ? value : 'system');
  let saved = null;
  try {
    saved = localStorage.getItem('toolsiano-theme');
  } catch {}
  root.dataset.themePreference = preference(saved);
  function apply() {
    const mode = preference(root.dataset.themePreference);
    root.dataset.theme = mode === 'system' ? (system.matches ? 'dark' : 'light') : mode;
    root.style.colorScheme = root.dataset.theme;
    document.dispatchEvent(new Event('toolsiano-theme-applied'));
  }
  apply();
  system.addEventListener('change', apply);
  document.addEventListener('toolsiano-theme-change', apply);
  window.addEventListener('storage', (event) => {
    if (event.key === 'toolsiano-theme' || event.key === null) {
      root.dataset.themePreference = preference(event.newValue);
      apply();
    }
  });
})();
