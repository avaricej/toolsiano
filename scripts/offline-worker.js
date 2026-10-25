// Only application resources listed by the build are stored here, never user files.
// RELEASE and ASSETS are prepended by scripts/finalize.mjs.
const PREFIX = 'toolsiano-';
const MARKER = '/__toolsiano_offline__';
let saving;
self.addEventListener('install', (e) => e.waitUntil(self.skipWaiting()));
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

async function readyCache() {
  for (const name of (await caches.keys()).reverse()) {
    if (!name.startsWith(PREFIX)) continue;
    const cache = await caches.open(name);
    if (await cache.match(MARKER)) return cache;
    // Migrate existing copies created before the completion marker was introduced.
    if (
      !name.includes('-pending-') &&
      (await cache.match('/build-info.json')) &&
      (await cache.match('/en/')) &&
      (await cache.match('/ru/'))
    )
      return cache;
  }
}
async function saveCopy(port, reportProgress) {
  const name = `${PREFIX}${RELEASE}-pending-${Date.now()}`;
  const cache = await caches.open(name);
  try {
    let done = 0;
    for (let i = 0; i < ASSETS.length; i += 4) {
      const batch = await Promise.allSettled(
        ASSETS.slice(i, i + 4).map(async (path) => {
          const response = await fetch(path, { cache: 'reload' });
          if (!response.ok || response.type === 'opaque')
            throw new Error('OFFLINE_RESOURCE_FAILED');
          await cache.put(path, response);
          done++;
          if (reportProgress) port?.postMessage({ progress: done, total: ASSETS.length });
        }),
      );
      if (batch.some((result) => result.status === 'rejected'))
        throw new Error('OFFLINE_RESOURCE_FAILED');
    }
    await cache.put(
      MARKER,
      new Response(
        JSON.stringify({ release: RELEASE, savedAt: Date.now(), count: ASSETS.length }),
        {
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    // Keep the previous working copy until every resource of the new one is saved.
    for (const key of await caches.keys())
      if (key.startsWith(PREFIX) && key !== name) await caches.delete(key);
    port?.postMessage({ ok: true });
  } catch {
    await caches.delete(name);
    port?.postMessage({ ok: false });
  }
}
self.addEventListener('message', (e) => {
  if (e.data?.type !== 'CACHE_APP') return;
  if (saving) {
    e.ports[0]?.postMessage({ ok: false });
    return;
  }
  saving = saveCopy(e.ports[0], e.data.progress === true).finally(() => {
    saving = undefined;
  });
  e.waitUntil(saving);
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin || url.search) return;
  if (!ASSETS.includes(url.pathname) && !url.pathname.startsWith('/_astro/')) return;
  e.respondWith(
    (async () => {
      const cache = await readyCache();
      if (e.request.mode === 'navigate') {
        try {
          return await fetch(e.request);
        } catch {
          return (await cache?.match(url.pathname)) || Response.error();
        }
      }
      return (await cache?.match(url.pathname)) || fetch(e.request);
    })(),
  );
});
