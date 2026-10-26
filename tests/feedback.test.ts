import test from 'node:test';
import assert from 'node:assert/strict';
import { bugReportUrl, isSupportEmailUrl } from '../src/lib/feedback.ts';

test('feedback drafts use only trusted version, tool and runtime metadata', () => {
  for (const lang of ['ru', 'en'] as const) {
    const href = bugReportUrl('1.0.5', 'image-tools', lang, true);
    const url = new URL(href);
    assert.equal(isSupportEmailUrl(url), true);
    assert.equal(url.pathname, 'anak.devel@gmail.com');
    assert.deepEqual([...url.searchParams.keys()], ['subject', 'body']);
    assert.match(decodeURIComponent(href), /1\.0\.5/);
    assert.match(url.searchParams.get('body')!, /Редактор изображений|Image editor/);
    assert.equal(href.includes('+'), false);
  }
  const unsafe = bugReportUrl('private\nBcc:other@example.org', 'secret filename.pdf', 'en', false);
  assert.equal(decodeURIComponent(unsafe).includes('secret'), false);
  assert.equal(decodeURIComponent(unsafe).includes('Bcc'), false);
  for (const href of ['mailto:other@example.org', 'mailto:anak.devel@gmail.com.evil',
    'mailto:anak.devel@gmail.com?attach=C:/private.pdf', 'https://example.org'])
    assert.equal(isSupportEmailUrl(new URL(href)), false);
});
