// Applied only to the native package. Web templates and their SEO content stay intact.
export function simplifyDesktop(document, architecture = 'x64') {
  const en = document.documentElement.lang === 'en';
  document.documentElement.dataset.architecture = architecture;
  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = '/desktop.css';
  document.head.append(style);
  const preferences = document.createElement('script');
  preferences.src = '/desktop-preferences.js';
  document.head.prepend(preferences);
  function disclosure(nodes, label, settings = true) {
    nodes = nodes.filter(Boolean);
    if (!nodes.length) return;
    const details = document.createElement('details');
    details.className = settings ? 'desktop-details desktop-settings' : 'desktop-details';
    const summary = document.createElement('summary');
    summary.textContent = label;
    details.append(summary);
    nodes[0].before(details);
    nodes.forEach((node) => details.append(node));
    return details;
  }
  const field = (id) => document.getElementById(id)?.closest('.field');
  const slug = document.querySelector('[data-tool]')?.dataset.tool;
  if (slug === 'image-tools') {
    disclosure(
      ['image-rotate', 'image-crop', 'image-filter'].map(field),
      en ? 'Rotate, crop and filters' : 'Поворот, обрезка и фильтры',
    );
    const watermark = document.getElementById('watermark-controls');
    if (watermark) {
      watermark.querySelector('legend')?.classList.add('sr-only');
      disclosure([watermark], en ? 'Watermark' : 'Водяной знак');
    }
  }
  if (slug === 'pdf-watermark')
    disclosure(
      [document.getElementById('wm-settings')],
      en ? 'Position and appearance' : 'Положение и оформление',
    );
  if (slug === 'qr') disclosure([field('qr-level')], en ? 'Error correction' : 'Коррекция ошибок');

  const docs = document.querySelector('.tool-docs');
  if (docs)
    disclosure(
      [docs],
      en ? 'Help, limitations and libraries' : 'Справка, ограничения и библиотеки',
      false,
    );
  const controls = document.getElementById('tool-controls');
  if (controls) {
    const process = controls.querySelector('#process');
    if (process) {
      const actions = document.createElement('div');
      actions.className = 'desktop-primary-actions';
      const upload = controls.querySelector('.dropzone');
      if (upload) upload.after(actions);
      else controls.insertBefore(actions, controls.children[1] || null);
      actions.append(process);
    }
    // Keep warnings next to their controls and dynamic notes where tools update them.
    // Only move the long static introductory image note into help.
    const note = [...controls.children].find((node) => node.matches('p.note') && !node.id);
    if (note && slug === 'image-tools') {
      const help = docs?.closest('details');
      if (help) help.append(note);
    }
  }
  for (const link of document.querySelectorAll('.sidebar .nav-link')) {
    const label = link.textContent
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\s*11$/, '');
    link.setAttribute('aria-label', label);
    link.setAttribute('title', label);
    const span = document.createElement('span');
    span.className = 'desktop-nav-text';
    for (const child of [...link.childNodes]) if (child.nodeType === 3) span.append(child);
    link.insertBefore(span, link.querySelector('.count'));
  }
  const button = document.createElement('button');
  button.id = 'desktop-sidebar-toggle';
  button.type = 'button';
  button.className = 'icon-button desktop-sidebar-toggle';
  button.setAttribute('aria-controls', 'sidebar');
  button.setAttribute('aria-expanded', 'true');
  button.setAttribute('aria-label', en ? 'Collapse navigation' : 'Свернуть навигацию');
  button.innerHTML =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 5h16M4 12h16M4 19h16"/></svg>';
  document.querySelector('.topbar-left')?.prepend(button);
  document.querySelector('.back-link')?.remove();
  document.querySelector('.tool-heading .privacy-strip')?.remove();
  document.querySelector('.hero-art')?.remove();
  document.querySelector('.trust-panel')?.remove();
  const heroTitle = document.querySelector('.hero h1');
  if (heroTitle) heroTitle.textContent = en ? 'What would you like to do?' : 'Что нужно сделать?';
  const heroDescription = document.querySelector('.hero-description');
  if (heroDescription)
    heroDescription.textContent = en
      ? 'Choose a tool. Files are processed locally, without the internet.'
      : 'Выберите инструмент. Файлы обрабатываются локально, без интернета.';
  document.querySelector('.hero .eyebrow')?.remove();
  document.querySelector('.hero-features')?.remove();
  if (architecture === 'x86') {
    const note = document.createElement('p');
    note.className = 'desktop-limit-note';
    note.textContent = en
      ? 'Windows x86 · 15 files / 50 MB per task · 12 megapixels · 50 PDF pages · 50 MB of results.'
      : 'Windows x86 · 15 файлов / 50 МБ на задание · 12 мегапикселей · 50 страниц PDF · 50 МБ результатов.';
    document.querySelector('.tool-heading')?.append(note);
  }
}
