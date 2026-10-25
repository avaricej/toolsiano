import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('offline update keeps a working copy on failure and replaces it only after a complete save', async () => {
  const stores = new Map<string, Map<string, Response>>();
  const cacheStorage = {
    async keys() {
      return [...stores.keys()];
    },
    async delete(key: string) {
      return stores.delete(key);
    },
    async open(key: string) {
      if (!stores.has(key)) stores.set(key, new Map());
      const data = stores.get(key)!;
      return {
        async match(path: string) {
          return data.get(path)?.clone();
        },
        async put(path: string, response: Response) {
          data.set(path, response.clone());
        },
      };
    },
  };
  const old = await cacheStorage.open('toolsiano-old');
  await old.put('/__toolsiano_offline__', new Response(JSON.stringify({ release: 'old' })));
  await old.put('/en/', new Response('old working page'));
  await cacheStorage.open('unrelated-cache');
  const listeners: Record<string, (e: any) => void> = {};
  let fail = true;
  runInNewContext(readFileSync('scripts/offline-worker.js', 'utf8'), {
    RELEASE: 'new',
    ASSETS: ['/en/', '/ru/', '/a.js', '/b.js', '/c.js'],
    caches: cacheStorage,
    Response,
    Date,
    URL,
    fetch: async (path: string) =>
      new Response(path, { status: fail && path === '/a.js' ? 503 : 200 }),
    self: {
      addEventListener: (type: string, listener: any) => {
        listeners[type] = listener;
      },
      clients: { claim: async () => {} },
      skipWaiting: async () => {},
    },
  });
  let pending: Promise<void> = Promise.resolve();
  listeners.activate({
    waitUntil: (p: Promise<void>) => {
      pending = p;
    },
  });
  await pending;
  assert.ok(stores.has('toolsiano-old'), 'activation must not evict the working copy');
  async function save() {
    const messages: any[] = [];
    listeners.message({
      data: { type: 'CACHE_APP', progress: true },
      ports: [{ postMessage: (m: any) => messages.push(m) }],
      waitUntil: (p: Promise<void>) => {
        pending = p;
      },
    });
    await pending;
    return messages;
  }
  const failed = await save();
  assert.equal(failed.at(-1).ok, false);
  assert.ok(stores.has('toolsiano-old'));
  assert.equal([...stores.keys()].filter((k) => k.includes('-pending-')).length, 0);
  fail = false;
  const success = await save();
  assert.equal(success.at(-1).ok, true);
  assert.equal(success.filter((m) => m.progress).length, 5);
  assert.ok(!stores.has('toolsiano-old'));
  assert.ok(stores.has('unrelated-cache'));
  const name = [...stores.keys()].find((k) => k.startsWith('toolsiano-new'))!;
  const current = await cacheStorage.open(name);
  assert.equal((await (await current.match('/__toolsiano_offline__'))!.json()).release, 'new');
  assert.equal(await (await current.match('/c.js'))!.text(), '/c.js');
});
