import { pathToFileURL } from 'node:url';

export async function waitForSite(baseURL, { timeoutMs = 60000, intervalMs = 1000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'No response';
  let attempts = 0;
  while (Date.now() < deadline) {
    attempts++;
    try {
      const response = await fetch(new URL('/ru/', baseURL), {
        redirect: 'manual',
        signal: AbortSignal.timeout(Math.max(1, Math.min(5000, deadline - Date.now()))),
      });
      const html = await response.text();
      if (response.status === 200 && html.includes('lang="ru"')) return attempts;
      lastError = `HTTP ${response.status}; Russian HTML not ready`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    const pause = Math.min(intervalMs, deadline - Date.now());
    if (pause > 0) await new Promise((resolve) => setTimeout(resolve, pause));
  }
  throw new Error(`Container did not become ready within ${timeoutMs} ms: ${lastError}`);
}

export async function checkContainer(baseURL, readiness = {}) {
  const attempts = await waitForSite(baseURL, readiness);
  for (const [route, expected, content] of [
    ['/en/', 200, 'lang="en"'],
    ['/ru/missing-ci-check/', 404, 'noindex'],
    ['/ru/loto/', 410, ''],
  ]) {
    const response = await fetch(new URL(route, baseURL), {
      redirect: 'manual',
      signal: AbortSignal.timeout(5000),
    });
    const html = await response.text();
    if (response.status !== expected || !html.includes(content))
      throw new Error(
        `${route}: expected HTTP ${expected} and matching content, got ${response.status}`,
      );
  }
  return attempts;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const attempts = await checkContainer(process.argv[2] || 'http://127.0.0.1:8080');
    console.log(
      `Container ready after ${attempts} attempt(s). English page, HTTP 404 and HTTP 410 verified.`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
