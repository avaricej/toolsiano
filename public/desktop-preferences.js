try {
  const saved = sessionStorage.getItem('toolsiano-sidebar');
  document.documentElement.classList.toggle(
    'desktop-sidebar-compact',
    saved ? saved === 'compact' : innerWidth < 1100,
  );
} catch {
  document.documentElement.classList.toggle('desktop-sidebar-compact', innerWidth < 1100);
}
