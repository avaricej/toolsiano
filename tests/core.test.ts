import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generatePassword,
  passwordGroups,
  secureInt,
  wifiPayload,
  vcardPayload,
} from '../src/lib/core.ts';
test('passwords contain selected sets, respect length, exclude ambiguous characters', () => {
  for (let i = 0; i < 100; i++) {
    const p = generatePassword(20, Object.values(passwordGroups), true);
    assert.equal(p.length, 20);
    assert.ok(!/[O0Il1|]/.test(p));
    for (const group of Object.values(passwordGroups))
      assert.ok([...p].some((c) => group.includes(c)));
  }
});
test('password generation rejects empty selection and invalid length', () => {
  assert.throws(() => generatePassword(20, []));
  assert.throws(() => generatePassword(0, ['abc']));
  assert.throws(() => generatePassword(1000, ['abc']));
});
test('random integer stays in range and rejects invalid bounds', () => {
  for (let i = 0; i < 1000; i++) assert.ok(secureInt(7) < 7);
  assert.equal(secureInt(1), 0);
  assert.throws(() => secureInt(0));
  assert.throws(() => secureInt(1.5));
});
test('Wi-Fi escapes delimiters and does not retain password for open networks', () => {
  assert.equal(wifiPayload('a;b', 'p:q', 'WPA', true), 'WIFI:T:WPA;S:a\\;b;P:p\\:q;H:true;;');
  assert.ok(!wifiPayload('test', 'secret', 'nopass', false).includes('secret'));
  assert.throws(() => wifiPayload('', '', 'WPA', false));
});
test('vCard prevents newline field injection', () => {
  assert.ok(vcardPayload('Name\nTEL:123', '', '').includes('FN:Name\\nTEL:123'));
  assert.throws(() => vcardPayload('', '', ''));
});
