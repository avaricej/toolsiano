import { tools } from '../src/data/tools.ts';
export const removed = ['pomodoro', 'format', 'seo', 'diary', 'loto'];
export function defaultLanguage(host) {
  let hostname;
  try {
    hostname = new URL('http://' + host).hostname.toLowerCase();
  } catch {
    hostname = 'localhost';
  }
  return hostname.endsWith('.com') ? 'en' : 'ru';
}
export function routeRequest(path, host) {
  const lang = defaultLanguage(host);
  const parts = path.split('/').filter(Boolean);
  if (removed.includes(parts.find((p) => !['en', 'ru', 'tools'].includes(p))))
    return { status: 410 };
  if (['/404.html', '/en/404.html', '/ru/404.html'].includes(path)) return { status: 404 };
  if (path.endsWith('/index.html')) return { status: 301, location: path.slice(0, -10) };
  if (path === '/') return { status: 302, location: '/' + lang + '/' };
  if (path === '/tools' || path === '/tools/') return { status: 301, location: '/' + lang + '/' };
  if (parts[0] === 'tools') parts.shift();
  if (parts[0] === 'compressor') parts[0] = 'file-compressor';
  if (
    !['en', 'ru'].includes(parts[0]) &&
    [...tools.map((t) => t.slug), 'about', 'security', 'privacy', 'libraries', 'download'].includes(parts[0]) &&
    parts.length === 1
  )
    return { status: 301, location: '/' + lang + '/' + parts[0] + '/' };
  if (
    ['en', 'ru'].includes(parts[0]) &&
    !path.endsWith('/') &&
    (parts.length === 1 ||
      (parts.length === 2 &&
        [...tools.map((t) => t.slug), 'about', 'security', 'privacy', 'libraries', 'download'].includes(
          parts[1],
        )))
  )
    return { status: 308, location: path + '/' };
  return null;
}
