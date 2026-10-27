import { mkdir, writeFile } from 'node:fs/promises';
import {
  fetchReleases,
  installerPlatform,
  repositoryArgument,
  releaseCli,
} from './github-releases.mjs';

await releaseCli(async () => {
  const repository = repositoryArgument(process.argv.slice(2));
  const releases = await fetchReleases(repository);
  const rows = releases.flatMap((release) =>
    release.assets
      .filter((asset) => asset.state === 'uploaded' && installerPlatform(asset.name))
      .map((asset) => ({
        version: release.tag_name,
        platform: installerPlatform(asset.name),
        assetId: asset.id,
        file: asset.name,
        downloads: asset.download_count,
      })),
  );
  const observedAt = new Date().toISOString();
  const total = rows.reduce((sum, row) => sum + row.downloads, 0);
  const escape = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch],
    );
  const html = `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'"><title>Toolsiano — скачивания / Downloads</title><style>body{font:16px system-ui;max-width:1100px;margin:32px auto;padding:16px;color:#162c23;background:#f7f9f8}table{border-collapse:collapse;width:100%;overflow-wrap:anywhere}th,td{padding:12px;border-bottom:1px solid #ccd9d1;text-align:left}small{color:#496054}</style><h1>Скачивания установщиков / Installer downloads</h1><p>${escape(repository)} · ${escape(observedAt)}</p><p>Всего / Total: <strong>${total}</strong></p><p>Повторные загрузки и обновления включены. Это не число пользователей или установок.<br>Repeat downloads and updates are included. These are not unique users or installations.</p><table><thead><tr><th>Версия / Version</th><th>Система / OS</th><th>Файл / File</th><th>Скачивания / Downloads</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${escape(row.version)}</td><td>${escape(row.platform)}</td><td>${escape(row.file)}</td><td>${row.downloads}</td></tr>`).join('')}</tbody></table></html>`;
  const directory = new URL('../work/download-statistics/', import.meta.url);
  await mkdir(directory, { recursive: true });
  const snapshot = { repository, observedAt, total, assets: rows };
  await writeFile(
    new URL(observedAt.replace(/[:.]/g, '-') + '.json', directory),
    JSON.stringify(snapshot, null, 2),
  );
  await writeFile(new URL('index.html', directory), html);
  console.table(rows);
  console.log(
    `Total: ${total}. Local report: work/download-statistics/index.html (not published).`,
  );
});
