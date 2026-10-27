import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchReleases } from '../scripts/github-releases.mjs';

test('GitHub API uses optional environment authentication and does not retry rate-limited requests', async () => {
  const originalFetch = globalThis.fetch;
  const originalGH = process.env.GH_TOKEN,
    originalGitHub = process.env.GITHUB_TOKEN;
  try {
    process.env.GH_TOKEN = 'synthetic-test-token';
    delete process.env.GITHUB_TOKEN;
    let requests = 0;
    globalThis.fetch = async (_url, options) => {
      requests++;
      assert.equal(
        new Headers(options?.headers).get('Authorization'),
        'Bearer synthetic-test-token',
      );
      return Response.json([]);
    };
    assert.deepEqual(await fetchReleases('example/toolsiano'), []);
    assert.equal(requests, 1);
    delete process.env.GH_TOKEN;
    process.env.GITHUB_TOKEN = 'synthetic-test-token';
    assert.deepEqual(await fetchReleases('example/toolsiano'), []);
    delete process.env.GITHUB_TOKEN;
    requests = 0;
    globalThis.fetch = async () => {
      requests++;
      return Response.json(
        { message: 'API rate limit exceeded' },
        {
          status: 403,
          headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '4102444800' },
        },
      );
    };
    await assert.rejects(fetchReleases('example/toolsiano'), /Превышен лимит.*МСК.*GH_TOKEN/);
    assert.equal(requests, 1);
    globalThis.fetch = async () =>
      Response.json(
        { message: 'secondary rate limit' },
        {
          status: 403,
          headers: { 'x-ratelimit-remaining': '20', 'retry-after': '120' },
        },
      );
    await assert.rejects(fetchReleases('example/toolsiano'), /Превышен лимит.*МСК/);
    globalThis.fetch = async () => Response.json({ message: 'Forbidden' }, { status: 403 });
    await assert.rejects(fetchReleases('example/toolsiano'), /GitHub запретил доступ/);
    globalThis.fetch = async () => Response.json({ message: 'Bad credentials' }, { status: 401 });
    await assert.rejects(fetchReleases('example/toolsiano'), /не принял токен/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalGH === undefined) delete process.env.GH_TOKEN;
    else process.env.GH_TOKEN = originalGH;
    if (originalGitHub === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalGitHub;
  }
});
