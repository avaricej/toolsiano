export function repositoryArgument(args) {
  const repository = args[args.indexOf('--repo') + 1];
  if (!args.includes('--repo') || !/^[\w.-]+\/[\w.-]+$/.test(repository || ''))
    throw new Error('Usage: --repo OWNER/REPOSITORY (public repository)');
  return repository;
}

export async function fetchReleases(repository) {
  const token = (process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '').trim();
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Toolsiano-release-tools',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const releases = [];
  for (let page = 1; page <= 100; page++) {
    const response = await fetch(
      `https://api.github.com/repos/${repository}/releases?per_page=100&page=${page}`,
      {
        headers,
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!response.ok) {
      const details = await response.json().catch(() => ({}));
      const limited =
        response.status === 429 ||
        ([403, 429].includes(response.status) &&
          (response.headers.get('x-ratelimit-remaining') === '0' ||
            /rate limit/i.test(details?.message || '')));
      let message = `GitHub API: HTTP ${response.status}. `;
      if (limited) {
        const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000;
        const retry = response.headers.get('retry-after');
        const retryAt =
          retry && /^\d+$/.test(retry)
            ? Date.now() + Number(retry) * 1000
            : Date.parse(retry || '');
        const until = Math.max(
          Number.isFinite(reset) && reset > Date.now() ? reset : 0,
          Number.isFinite(retryAt) && retryAt > Date.now() ? retryAt : 0,
        );
        message += 'Превышен лимит запросов GitHub API. ';
        message += until
          ? `Повторите после ${new Date(until).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} (МСК). `
          : 'Подождите не менее минуты; не запускайте команду многократно. ';
        if (!token)
          message +=
            'Для авторизованных запросов можно задать GH_TOKEN или GITHUB_TOKEN в окружении. ';
      } else if (response.status === 401) {
        message +=
          'GitHub не принял токен. Проверьте GH_TOKEN/GITHUB_TOKEN, его срок действия и доступ. ';
      } else if (response.status === 403) {
        message +=
          'GitHub запретил доступ. Проверьте доступ к репозиторию и ограничения вашей сети; это не обязательно лимит запросов. ';
      } else if (response.status === 404) {
        message +=
          'Репозиторий не найден или недоступен. Проверьте OWNER/REPOSITORY и доступ к нему. ';
      }
      throw new Error(message + 'Предыдущий каталог/отчёт не изменён.');
    }
    const batch = await response.json();
    releases.push(...batch.filter((release) => !release.draft && !release.prerelease));
    if (batch.length < 100) return releases;
  }
  throw new Error('Too many release pages; report was not saved.');
}

export async function releaseCli(action) {
  try {
    await action();
  } catch (error) {
    let message = error instanceof Error ? error.message : 'Не удалось выполнить команду.';
    for (const token of [process.env.GH_TOKEN, process.env.GITHUB_TOKEN])
      if (token?.trim()) message = message.split(token.trim()).join('[скрыто]');
    console.error(message);
    process.exitCode = 1;
  }
}

export function installerPlatform(name) {
  if (/\.(exe|msi)$/i.test(name)) return 'windows';
  if (/\.dmg$/i.test(name)) return 'macos';
  if (/\.(AppImage|deb)$/i.test(name)) return 'linux';
  return null;
}

export function installerArchitecture(name) {
  if (/(?:^|[_.-])(arm64|aarch64)(?=[_.-]|$)/i.test(name)) return 'arm64';
  if (/(?:^|[_.-])(x64|x86_64|amd64)(?=[_.-]|$)/i.test(name)) return 'x64';
  if (/(?:^|[_.-])(x86|i686|ia32)(?=[_.-]|$)/i.test(name)) return 'x86';
  if (/(?:^|[_.-])universal(?=[_.-]|$)/i.test(name)) return 'universal';
  throw new Error(`Specify x86, x64, arm64 or universal in installer name: ${name}`);
}
