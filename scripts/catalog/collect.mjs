import { readFile, readdir, mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGitHubClient, discoverRepositories, diskCache, GitHubError, MetadataError, MAX_FILE_BYTES, readBlob, repositoryPath, repositoryTree } from "../../packages/catalog-kit/src/github.mjs";
import { createCatalog, parseCatalog } from "../../packages/catalog-kit/src/schema.mjs";
import { collectRound, fileCheckpoint } from "../../packages/catalog-kit/src/round.mjs";
import { createRegistryGitHubClient } from "../../packages/catalog-kit/src/proxy-client.mjs";
import { extractPlugins, candidate } from "./metadata.mjs";

export const root = fileURLToPath(new URL("../../", import.meta.url));
export function validateConfig(config) {
  if (!Array.isArray(config.topics) || !config.topics.length || new Set(config.topics).size !== config.topics.length || config.topics.some((topic) => !/^[a-z0-9][a-z0-9-]{0,49}$/.test(topic))) throw new Error("Invalid discovery topics");
  for (const field of ["officialRepositories", "seedRepositories"]) {
    if (!Array.isArray(config[field])) throw new Error(`Missing ${field}`);
    config[field].forEach(repositoryPath);
  }
  if (!config.excludeRepositories || typeof config.excludeRepositories !== "object" || Array.isArray(config.excludeRepositories)) throw new Error("Invalid exclusion map");
  for (const [name, reason] of Object.entries(config.excludeRepositories)) { repositoryPath(name); if (typeof reason !== "string" || !reason.trim()) throw new Error("Exclusions need a reason"); }
  if (!Number.isInteger(config.maxPluginsPerRepository) || config.maxPluginsPerRepository < 1 || config.maxPluginsPerRepository > 500) throw new Error("Invalid package count limit");
  return config;
}
export async function loadInputs(directory = root) {
  const config = validateConfig(JSON.parse(await readFile(path.join(directory, "catalog/config.json"), "utf8")));
  const overrides = [];
  let filenames;
  try { filenames = await readdir(path.join(directory, "registry/plugins")); } catch (error) { if (error.code !== "ENOENT") throw error; filenames = []; }
  for (const filename of filenames.filter((f) => f.endsWith(".json")).sort()) overrides.push(JSON.parse(await readFile(path.join(directory, "registry/plugins", filename), "utf8")));
  return { config, overrides };
}
export async function collectRemote({ get = createGitHubClient(), config, overrides = [], now = new Date(), checkpoint, onComplete = async () => {}, releaseCheckpoint, withReleases = true }) {
  validateConfig(config);
  const discovered = await discoverRepositories(get, config.topics, { now });
  const seeds = new Set(config.seedRepositories.map((name) => name.toLowerCase()));
  const excluded = new Set(Object.keys(config.excludeRepositories).map((name) => name.toLowerCase()));
  const names = [...new Set([...discovered, ...seeds].map((name) => name.toLowerCase()))].filter((name) => !excluded.has(name)).sort();
  const fetchedAt = now.toISOString();
  const round = await collectRound({ names, config: { ...config, adapterVersion: 1, overrides }, checkpoint, now: () => fetchedAt,
    collect: async (name) => {
      const repo = await get(repositoryPath(name), { optional: true });
      if (!repo || repo.private !== false || repo.disabled) return null;
      repositoryPath(repo.full_name);
      if (!Number.isSafeInteger(repo.id) || repo.id < 1) throw new GitHubError("Repository is missing numeric identity");
      if (excluded.has(repo.full_name.toLowerCase())) return null;
      const topic = config.topics.some((topic) => repo.topics?.includes(topic));
      if (!topic && !seeds.has(name)) return null;
      const discovery = topic ? "topic" : "seed";
      const source = await repositoryTree(get, repo);
      if (!source) return { repo, entries: [candidate(repo, { config, discovery, fetchedAt, problems: ["empty-repository"] })], issues: [] };
      return { repo, ...await extractPlugins({ repo, ...source, read: (file) => readBlob(get, repositoryPath(repo.full_name), file), config, overrides, discovery, fetchedAt }) };
    },
    finalize: (results, { completedAt }) => {
      const repositories = [...new Map(results.filter(Boolean).map((r) => [r.repo.id, r])).values()];
      return { repositories: repositories.map((r) => r.repo), catalog: createCatalog({ kind: "plugins", mode: "github", generatedAt: completedAt, topics: config.topics, entries: repositories.flatMap((r) => r.entries), issues: repositories.flatMap((r) => r.issues) }) };
    },
  });
  let releaseRound;
  if (withReleases) {
    const { collectReleases } = await import("../../packages/catalog-kit/src/releases.mjs");
    releaseRound = await collectReleases({ get, repositories: round.result.repositories, entries: round.result.catalog.entries, checkpoint: releaseCheckpoint, config: { ...config, adapterVersion: 1 }, now,
      extractAtCommit: async (repo, commitSha) => {
        const base = repositoryPath(repo.full_name);
        const commit = await get(`${base}/commits/${commitSha}`, { immutable: true });
        if (commit.sha !== commitSha || !/^[a-f0-9]{40,64}$/.test(commit.commit?.tree?.sha ?? "")) throw new GitHubError("Invalid release commit");
        const response = await get(`${base}/git/trees/${commit.commit.tree.sha}?recursive=1`, { immutable: true });
        if (response.truncated !== false || !Array.isArray(response.tree)) throw new GitHubError("Incomplete release tree");
        return extractPlugins({ repo, tree: response.tree, commitSha, read: (file) => readBlob(get, base, file), config, overrides, discovery: config.topics.some((topic) => repo.topics?.includes(topic)) ? "topic" : "seed", fetchedAt });
      },
    });
  }
  await onComplete(round.result.catalog, releaseRound?.releases ?? [], releaseRound?.issues ?? []);
  if (releaseRound) await releaseRound.acknowledge();
  await round.acknowledge();
  return round.result.catalog;
}
export async function collectLocal({ directory = root, config, overrides = [] }) {
  validateConfig(config);
  const tree = [];
  async function walk(relative) {
    for (const item of await readdir(path.join(directory, relative), { withFileTypes: true })) {
      if (item.isSymbolicLink() || [".git", "node_modules"].includes(item.name)) continue;
      const filename = path.posix.join(relative, item.name);
      if (item.isDirectory()) await walk(filename); else if (item.isFile()) tree.push({ path: filename, type: "blob", mode: "100644" });
    }
  }
  await walk("plugins"); await walk("examples");
  const repo = { id: null, name: "covel-plugins", full_name: "covel-ai/covel-plugins", private: false, default_branch: "main", owner: { login: "covel-ai" }, topics: [], license: { spdx_id: "MIT" } };
  const result = await extractPlugins({ repo, tree, config, overrides, discovery: "local", read: async (file) => { const bytes = await readFile(path.join(directory, file.path)); if (bytes.length > MAX_FILE_BYTES) throw new MetadataError("Manifest exceeds 256 KiB"); return bytes.toString("utf8"); } });
  return createCatalog({ kind: "plugins", mode: "local", topics: config.topics, ...result });
}
export async function writeJson(value, filename) {
  await mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`); await rename(temporary, filename);
}
export const writeCatalog = (catalog, filename) => writeJson(parseCatalog(catalog), filename);

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.slice(2).some((arg) => arg !== "--local")) throw new Error("Usage: node scripts/catalog/collect.mjs [--local]");
  const inputs = await loadInputs();
  const get = process.env.CATALOG_API_URL && process.env.CATALOG_INGEST_TOKEN
    ? createRegistryGitHubClient({ apiUrl: process.env.CATALOG_API_URL, token: process.env.CATALOG_INGEST_TOKEN, kind: "plugins" })
    : createGitHubClient({ cache: diskCache(path.join(root, ".cache/github")), maxRequests: Number(process.env.GITHUB_REQUEST_BUDGET ?? 900) });
  const output = path.join(root, "site/public/catalog.json");
  let catalog;
  if (process.argv.includes("--local")) { catalog = await collectLocal(inputs); await writeCatalog(catalog, output); await writeJson([], path.join(root, "artifacts/releases.json")); }
  else catalog = await collectRemote({ ...inputs, get, checkpoint: fileCheckpoint(path.join(root, ".cache/round/plugins.json")), releaseCheckpoint: fileCheckpoint(path.join(root, ".cache/round/plugin-releases.json")), onComplete: async (result, releases, issues) => {
    await writeJson(releases, path.join(root, "artifacts/releases.json")); await writeJson(issues, path.join(root, "artifacts/release-issues.json")); await writeCatalog(result, output);
  } });
  await writeJson({ generatedAt: catalog.generatedAt, stats: catalog.stats, issues: catalog.issues, api: get.stats() }, path.join(root, "artifacts/collection-report.json"));
  console.log(`Collected ${catalog.stats.packages} package records from ${catalog.stats.repositories} repositories (${catalog.mode}); ${catalog.stats.issues} metadata issues.`);
}
