import { tools } from '../data/tools.ts';
import { translate, type Locale } from './i18n.ts';

export const supportEmail = 'anak.devel@gmail.com';

export function bugReportUrl(version: string, slug: string | undefined, lang: Locale, desktop: boolean) {
  const release = /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version) ? version : '?';
  const tool = tools.find(tool => tool.slug === slug);
  const name = tool ? translate(tool.name, lang) : lang === 'ru' ? 'Общие вопросы' : 'General';
  const body = lang === 'ru'
    ? `Версия Toolsiano: ${release}\nИнструмент: ${name}\nПриложение: ${desktop ? 'десктоп' : 'веб'}\n\nЧто произошло:\n\nЧто ожидалось:\n\nКак повторить ошибку:\n\nНе прикладывайте личные документы, пароли и другие конфиденциальные данные.`
    : `Toolsiano version: ${release}\nTool: ${name}\nApp: ${desktop ? 'desktop' : 'web'}\n\nWhat happened:\n\nExpected behavior:\n\nSteps to reproduce:\n\nDo not attach personal documents, passwords or other confidential data.`;
  const url = new URL(`mailto:${supportEmail}`);
  url.searchParams.set('subject', `Toolsiano ${release} — ${lang === 'ru' ? 'сообщение об ошибке' : 'bug report'}`);
  url.searchParams.set('body', body);
  return url.href.replace(/\+/g, '%20');
}

export function isSupportEmailUrl(url: URL) {
  return url.protocol === 'mailto:' && url.pathname === supportEmail && !url.hash &&
    [...url.searchParams.keys()].every(key => key === 'subject' || key === 'body');
}
