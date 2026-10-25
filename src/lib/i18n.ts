import messages from '../i18n/en.json' with { type: 'json' };
export type Locale = 'ru' | 'en';
export function locale(): Locale {
  return typeof document !== 'undefined' && document.documentElement.lang === 'en' ? 'en' : 'ru';
}
const dictionary = messages as Record<string, string>;
const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patterns = Object.entries(dictionary)
  .filter(([k]) => /\{\d+\}/.test(k))
  .sort((a, b) => b[0].replace(/\{\d+\}/g, '').length - a[0].replace(/\{\d+\}/g, '').length)
  .map(([key, value]) => {
    const ids: number[] = [];
    const regex = escape(key).replace(/\\\{(\d+)\\\}/g, (_, id) => {
      ids.push(Number(id));
      return '(.*?)';
    });
    return { regex: new RegExp('^' + regex + '$', 's'), value, ids };
  });
export function translate(source: string, lang: Locale = 'en'): string {
  if (lang === 'ru') return source;
  const key = normalize(source);
  if (dictionary[key] !== undefined) return dictionary[key];
  for (const p of patterns) {
    const match = key.match(p.regex);
    if (match) {
      const values = new Map(p.ids.map((id, i) => [id, match[i + 1]]));
      return p.value.replace(/\{(\d+)\}/g, (_, id) => values.get(Number(id)) || '');
    }
  }
  let result = key;
  for (const [ru, en] of Object.entries(dictionary)
    .filter(([k]) => k.length >= 3 && !k.includes('{'))
    .sort((a, b) => b[0].length - a[0].length)) {
    result = result.replace(
      new RegExp('(?<![\\p{L}])' + escape(ru) + '(?![\\p{L}])', 'gu'),
      () => en,
    );
  }
  return result;
}
export function t(source: string) {
  const lang = locale();
  const translated = translate(source, lang);
  return lang === 'en'
    ? (source.match(/^\s*/)?.[0] || '') + translated.trim() + (source.match(/\s*$/)?.[0] || '')
    : source;
}
