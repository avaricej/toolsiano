export function repositoryArgument(args) {
  const repository = args[args.indexOf('--repo') + 1];
  if (!args.includes('--repo') || !/^[\w.-]+\/[\w.-]+$/.test(repository || ''))
    throw new Error('Usage: --repo OWNER/REPOSITORY (public repository)');
  return repository;
}

export async function fetchReleases(repository) {
  const releases = [];
  for (let page = 1; page <= 100; page++) {
    const response = await fetch(
      `https://api.github.com/repos/${repository}/releases?per_page=100&page=${page}`,
      {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Toolsiano-release-tools' },
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!response.ok)
      throw new Error(
        `GitHub API: HTTP ${response.status}. Previous catalog/report has not been replaced.`,
      );
    const batch = await response.json();
    releases.push(...batch.filter((release) => !release.draft && !release.prerelease));
    if (batch.length < 100) return releases;
  }
  throw new Error('Too many release pages; report was not saved.');
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
