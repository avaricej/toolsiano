import { t } from '../../lib/i18n.ts';
import { $, value, checked, number, status, action, copy, download } from '../../lib/ui.ts';
import { generatePassword, passwordGroups, wifiPayload, vcardPayload } from '../../lib/core.ts';
export async function init(slug: string) {
  if (slug === 'password') {
    const generate = () => {
      const groups = Object.entries(passwordGroups)
        .filter(([k]) => checked('pw-' + k))
        .map(([, v]) => v);
      const length = number('password-length', 8, 128);
      const password = generatePassword(length, groups, checked('pw-ambiguous'));
      $<HTMLTextAreaElement>('password-output').value = password;
      const pool = groups.join('').replace(checked('pw-ambiguous') ? /[O0Il1|]/g : /$^/g, '');
      $('password-info').textContent = t(
        `${length} символов · ${pool.length} символов в алфавите · криптографически стойкая генерация`,
      );
      $('strength-bar').style.width = Math.min(100, (length * Math.log2(pool.length)) / 1.28) + '%';
      status(t('Новый пароль создан на устройстве.'));
    };
    action('process', generate);
    $('password-length').addEventListener(
      'input',
      () => ($('length-value').textContent = value('password-length')),
    );
    action('copy-password', async () => {
      await copy(value('password-output'));
      status(t('Пароль скопирован. Помните о буфере обмена.'));
    });
    action('clear-password', () => {
      $<HTMLTextAreaElement>('password-output').value = '';
      $('password-info').textContent = '';
      $('strength-bar').style.width = '0';
      status(t('Пароль очищен'));
    });
    generate();
    return;
  }
  const { default: QRCode } = await import('qrcode');
  let payload = '',
    canvas: HTMLCanvasElement | undefined,
    svg = '';
  $('qr-type').addEventListener('change', () => {
    const type = value('qr-type');
    $('qr-text-fields').hidden = type !== 'text';
    $('qr-wifi-fields').hidden = type !== 'wifi';
    $('qr-contact-fields').hidden = type !== 'contact';
    invalidate();
  });
  function invalidate() {
    payload = '';
    svg = '';
    canvas = undefined;
    $('qr-preview').textContent = t('Создайте QR-код с текущими данными');
    $<HTMLButtonElement>('qr-png').disabled = true;
    $<HTMLButtonElement>('qr-svg').disabled = true;
  }
  document
    .querySelectorAll('.workspace input,.workspace textarea,.workspace select')
    .forEach((el) => el.addEventListener('input', invalidate));
  action('process', async () => {
    const type = value('qr-type');
    payload =
      type === 'wifi'
        ? wifiPayload(
            value('wifi-name'),
            value('wifi-password'),
            value('wifi-security'),
            checked('wifi-hidden'),
          )
        : type === 'contact'
          ? vcardPayload(value('contact-name'), value('contact-phone'), value('contact-email'))
          : value('qr-text');
    if (!payload.trim()) throw new Error(t('Введите содержимое QR-кода'));
    const options = {
      width: 768,
      margin: 4,
      errorCorrectionLevel: value('qr-level') as 'L' | 'M' | 'Q' | 'H',
      color: { dark: '#102a20', light: '#ffffff' },
    };
    canvas = document.createElement('canvas');
    try {
      await QRCode.toCanvas(canvas, payload, options);
      svg = await QRCode.toString(payload, { ...options, type: 'svg' });
    } catch {
      invalidate();
      throw new Error(
        t('Слишком много данных для QR-кода. Сократите текст или уменьшите коррекцию ошибок.'),
      );
    }
    $('qr-preview').replaceChildren(canvas);
    $<HTMLButtonElement>('qr-png').disabled = false;
    $<HTMLButtonElement>('qr-svg').disabled = false;
    status(t('QR-код готов. Проверьте его сканированием перед использованием.'));
  });
  action('qr-png', async () => {
    if (!canvas) throw new Error(t('Сначала создайте QR-код'));
    const blob = await new Promise<Blob | null>((r) => canvas!.toBlob(r));
    if (blob) await download(blob, 'toolsiano-qr.png');
  });
  action('qr-svg', async () => {
    if (!svg) throw new Error(t('Сначала создайте QR-код'));
    await download(new Blob([svg], { type: 'image/svg+xml' }), 'toolsiano-qr.svg');
  });
  action('qr-clear', () => {
    [
      'qr-text',
      'wifi-name',
      'wifi-password',
      'contact-name',
      'contact-phone',
      'contact-email',
    ].forEach((id) => ($<HTMLInputElement>(id).value = ''));
    invalidate();
    status(t('Данные очищены'));
  });
}
