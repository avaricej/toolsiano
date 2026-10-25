import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
let building = false,
  queued = false,
  timer,
  server;
async function build() {
  if (building) {
    queued = true;
    return;
  }
  building = true;
  const ok = await new Promise((resolve) => {
    const child = spawn(process.execPath, ['scripts/astro.mjs', 'build'], { stdio: 'inherit' });
    child.on('exit', (code) => resolve(code === 0));
  });
  if (ok)
    await new Promise((resolve) => {
      const child = spawn(process.execPath, ['scripts/finalize.mjs'], { stdio: 'inherit' });
      child.on('exit', (code) => {
        if (code === 0 && !server)
          server = spawn(process.execPath, ['scripts/serve.mjs'], { stdio: 'inherit' });
        resolve();
      });
    });
  building = false;
  if (queued) {
    queued = false;
    await build();
  }
}
await build();
for (const dir of ['src', 'public'])
  watch(dir, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(build, 300);
  });
console.log('Watching src/ and public/. Refresh the browser after a successful rebuild.');
process.on('SIGINT', () => {
  server?.kill();
  process.exit();
});
