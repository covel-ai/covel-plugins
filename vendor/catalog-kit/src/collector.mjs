import { discoverRepositories, repositoryPath, repositoryTree, readBlob, GitHubError } from './github.mjs';
import { collectRound } from './round.mjs';
import { collectReleases } from './releases.mjs';
import { createCatalog } from './schema.mjs';
import * as plugins from '../adapters/plugins.mjs';
import * as worlds from '../adapters/worlds.mjs';

/** Shared production orchestration; deployment supplies durable checkpoints and transport. */
export async function collectCatalog({ kind, config, overrides = [], get, checkpoint, releaseCheckpoint, onComplete, now = new Date() }) {
  if (!['plugins', 'worlds'].includes(kind) || typeof onComplete !== 'function') throw new Error('Invalid collector configuration');
  const adapter = kind === 'plugins' ? plugins : worlds;
  const extract = kind === 'plugins' ? plugins.extractPlugins : worlds.extractWorlds;
  for (const list of [config.seedRepositories, config.officialRepositories]) { if (!Array.isArray(list)) throw new Error('Missing repository configuration'); list.forEach(repositoryPath); }
  const seeds = new Set(config.seedRepositories.map((n) => n.toLowerCase()));
  const excluded = new Set(Object.keys(config.excludeRepositories ?? {}).map((n) => n.toLowerCase()));
  const names = [...new Set([...(await discoverRepositories(get, config.topics, { now })), ...seeds].map((n) => n.toLowerCase()))].filter((n) => !excluded.has(n)).sort();
  const fetchedAt = now.toISOString(), roundConfig = { protocol: 1, kind, config, overrides };
  const parse = (repo, source, discovery) => extract({ repo, ...source, config, overrides, discovery, fetchedAt, read: (file) => readBlob(get, repositoryPath(repo.full_name), file) });
  const round = await collectRound({ names, config: roundConfig, checkpoint, now: () => new Date().toISOString(), collect: async (name) => {
    const repo = await get(repositoryPath(name), { optional: true });
    if (!repo || repo.private !== false || repo.disabled || excluded.has(repo.full_name.toLowerCase())) return null;
    repositoryPath(repo.full_name);
    if (!Number.isSafeInteger(repo.id) || repo.id < 1) throw new GitHubError('Missing numeric repository identity');
    const topic = config.topics.some((t) => repo.topics?.includes(t));
    if (!topic && !seeds.has(name)) return null;
    const discovery = topic ? 'topic' : 'seed', source = await repositoryTree(get, repo);
    return { repo, seed: seeds.has(name), ...(source ? await parse(repo, source, discovery) : { entries: [adapter.candidate(repo, { config, discovery, fetchedAt, problems: ['empty-repository'] })], issues: [] }) };
  }, finalize: (results) => [...new Map(results.filter(Boolean).map((r) => [r.repo.id, r])).values()] });
  // Revalidate EVERY resumed identity/membership, including topic removals after search.
  const repositories = [];
  for (const result of round.result) {
    const live = await get(`/repositories/${result.repo.id}`, { optional: true });
    if (!live || live.private !== false || live.disabled || live.id !== result.repo.id || excluded.has(live.full_name.toLowerCase())) continue;
    if (!result.seed && !config.topics.some((t) => live.topics?.includes(t))) continue;
    if (live.owner?.id !== result.repo.owner?.id || live.full_name !== result.repo.full_name || live.archived !== result.repo.archived) {
      const source = await repositoryTree(get, live);
      const discovery = config.topics.some((t) => live.topics?.includes(t)) ? 'topic' : 'seed';
      repositories.push({ repo: live, seed: result.seed, ...(source ? await parse(live, source, discovery) : { entries: [adapter.candidate(live, { config, discovery, fetchedAt, problems: ['empty-repository'] })], issues: [] }) });
      continue;
    }
    repositories.push(result);
  }
  const catalog = createCatalog({ kind, mode: 'github', generatedAt: new Date().toISOString(), topics: config.topics, entries: repositories.flatMap((r) => r.entries), issues: repositories.flatMap((r) => r.issues) });
  const releases = await collectReleases({ get, repositories: repositories.map((r) => r.repo), entries: catalog.entries, checkpoint: releaseCheckpoint, config: roundConfig, now,
    extractAtCommit: async (repo, commitSha) => {
      const source = await repositoryTree(get, { ...repo, default_branch: commitSha });
      if (!source || source.commitSha !== commitSha) throw new GitHubError('Release commit resolution changed');
      return parse(repo, source, catalog.entries.find((e) => e.repositoryId === repo.id)?.discovery ?? 'topic');
    } });
  await onComplete(catalog, releases.releases, releases.issues);
  await releases.acknowledge(); await round.acknowledge();
  return catalog;
}
