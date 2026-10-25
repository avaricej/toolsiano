import { t } from './i18n.ts';
export function secureInt(max: number): number {
  if (!Number.isSafeInteger(max) || max < 1 || max > 0x100000000)
    throw new Error(t('Некорректный диапазон'));
  if (!globalThis.crypto?.getRandomValues)
    throw new Error(t('Web Crypto недоступен. Откройте приложение через HTTPS или localhost.'));
  const limit = Math.floor(0x100000000 / max) * max;
  const a = new Uint32Array(1);
  do {
    crypto.getRandomValues(a);
  } while (a[0] >= limit);
  return a[0] % max;
}
export function generatePassword(length: number, groups: string[], exclude = false): string {
  if (!Number.isInteger(length) || length < 8 || length > 128)
    throw new Error(t('Длина должна быть от 8 до 128'));
  const sets = groups.map((g) => (exclude ? g.replace(/[O0Il1|]/g, '') : g)).filter(Boolean);
  if (!sets.length) throw new Error(t('Выберите хотя бы один набор символов'));
  const pool = sets.join('');
  for (let attempt = 0; attempt < 10000; attempt++) {
    const chars = Array.from({ length }, () => pool[secureInt(pool.length)]);
    if (sets.every((s) => chars.some((c) => s.includes(c)))) return chars.join('');
  }
  throw new Error(t('Не удалось создать пароль. Повторите попытку.'));
}
export const passwordGroups = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.?',
};
export function wifiPayload(name: string, password: string, type: string, hidden: boolean) {
  const esc = (s: string) => s.replace(/([\\;,:" ])/g, '\\$1');
  if (!name.trim()) throw new Error(t('Введите название сети'));
  return `WIFI:T:${type};S:${esc(name)};P:${type === 'nopass' ? '' : esc(password)};H:${hidden};;`;
}
export function vcardPayload(name: string, phone: string, email: string) {
  if (!name.trim()) throw new Error(t('Введите имя контакта'));
  const esc = (s: string) =>
    s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${esc(name)}`,
    `TEL:${esc(phone)}`,
    `EMAIL:${esc(email)}`,
    'END:VCARD',
  ].join('\r\n');
}
