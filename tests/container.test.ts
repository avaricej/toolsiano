import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { checkContainer, waitForSite } from '../scripts/check-container.mjs';

test('container check survives connection resets during startup and verifies real error responses', async () => {
  let readyRequests = 0;
  let wrongStatus = false;
  const server = createServer((req, res) => {
    if (req.url === '/ru/' && ++readyRequests <= 2) {
      req.socket.destroy();
      return;
    }
    if (req.url === '/ru/') res.end('<html lang="ru">ready</html>');
    else if (req.url === '/en/') res.end('<html lang="en">ready</html>');
    else if (req.url === '/ru/loto/') {
      res.writeHead(410);
      res.end('gone');
    } else {
      res.writeHead(wrongStatus ? 200 : 404);
      res.end('noindex');
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test address');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    assert.equal(await checkContainer(base, { timeoutMs: 2000, intervalMs: 5 }), 3);
    wrongStatus = true;
    await assert.rejects(
      checkContainer(base, { timeoutMs: 2000, intervalMs: 5 }),
      /expected HTTP 404/,
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('container readiness has a deadline and cannot accept an error page as ready', async () => {
  const server = createServer((_req, res) => {
    res.writeHead(503);
    res.end('starting');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test address');
  try {
    await assert.rejects(
      waitForSite(`http://127.0.0.1:${address.port}`, { timeoutMs: 60, intervalMs: 5 }),
      /did not become ready/,
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
