import { parseDocument } from "yaml";
import semver from "semver";
import * as github from "../src/github.mjs";
import * as hashing from "../src/hash.mjs";

const { MetadataError, MAX_FILE_BYTES } = github;
const { packageKey, safePath, fingerprintTree } = hashing;
const CATEGORIES = ["fantasy", "science-fiction", "mystery", "slice-of-life", "historical", "authoring"];
const LOCALE = /^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-(?:[A-Z]{2}|[0-9]{3}))?$/;
const text = (value, max = 4000) => typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
const encodedPath = (value) => value.split("/").map(encodeURIComponent).join("/");

export function parseYaml(source) {
  if (Buffer.byteLength(source) > MAX_FILE_BYTES) throw new MetadataError("Manifest exceeds 256 KiB");
  const document = parseDocument(source, { uniqueKeys: true });
  if (document.errors.length || document.warnings.length) throw new MetadataError("Invalid or unsupported YAML");
  let value;
  try { value = document.toJS({ maxAliasCount: 20 }); }
  catch { throw new MetadataError("YAML aliases exceed the limit"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new MetadataError("Expected a YAML object");
  const active = new WeakSet();
  let nodes = 0;
  function checkTree(node, depth = 0) {
    if (!node || typeof node !== "object") return;
    if (active.has(node) || depth > 64 || ++nodes > 10000) throw new MetadataError("Cyclic or excessively nested YAML");
    active.add(node);
    for (const child of Object.values(node)) checkTree(child, depth + 1);
    active.delete(node);
  }
  checkTree(value);
  return value;
}

export function findWorlds(tree) {
  const files = new Map();
  for (const file of tree) {
    if (file.type !== "blob" || !/^100(644|755)$/.test(file.mode) || !safePath(file.path) || file.path.split("/").some((part) => [".git", "node_modules"].includes(part))) continue;
    if (files.has(file.path)) throw new MetadataError("Duplicate Git file path");
    files.set(file.path, file);
  }
  return [...files.keys()].filter((name) => /(^|\/)world\.yaml$/.test(name)).sort().map((manifestPath) => ({
    manifestPath,
    path: manifestPath === "world.yaml" ? "" : manifestPath.slice(0, -"/world.yaml".length),
    files,
  }));
}

export function candidate(repo, { config, discovery, packagePath = null, commitSha = null, sourceTreeHash = null, problems = [], fetchedAt = null }) {
  const repositoryId = discovery === "local" ? null : repo.id;
  github.repositoryPath(repo.full_name);
  const url = `https://github.com/${repo.full_name}`;
  const ref = repo.default_branch || "main";
  const suffix = packagePath ? `/${encodedPath(packagePath)}` : "";
  return {
    key: packageKey(repositoryId, "worlds", packagePath), kind: "worlds",
    id: (packagePath?.split("/").at(-1) || repo.name || repo.full_name.split("/")[1]).slice(0, 200),
    name: (packagePath?.split("/").at(-1) || repo.name || repo.full_name.split("/")[1]).slice(0, 200),
    description: text(repo.description) ?? "", repositoryId,
    ownerId: Number.isSafeInteger(repo.owner?.id) && repo.owner.id > 0 ? repo.owner.id : null,
    repository: repo.full_name, repositoryUrl: url,
    author: repo.owner?.login ?? repo.full_name.split("/")[0], path: packagePath,
    sourceRef: { type: "branch", name: ref }, commitSha, sourceTreeHash,
    contentHash: null, hashScheme: null, version: null, covelVersion: null, pluginPreset: null,
    license: text(repo.license?.spdx_id, 200) === "NOASSERTION" ? null : text(repo.license?.spdx_id, 200),
    category: "other", tags: [], locales: [], translations: {},
    official: config.officialRepositories.some((name) => name.toLowerCase() === repo.full_name.toLowerCase()),
    discovery, fork: repo.fork === true, status: repo.archived ? "archived" : "pending", problems,
    stars: Number.isSafeInteger(repo.stargazers_count) && repo.stargazers_count >= 0 ? repo.stargazers_count : null,
    downloadRequests: null, releasePublishedAt: null, firstSeenAt: null, contentChangedAt: null, fetchedAt,
    installUrl: null, pinnedUrl: null,
    readmeUrl: `${url}/tree/${encodeURIComponent(commitSha ?? ref)}${suffix}`,
  };
}

export function normalizeWorld(source, item, repo, options) {
  const manifest = parseYaml(source);
  if (manifest.schemaVersion !== "1.0") throw new MetadataError("Unsupported world schemaVersion");
  for (const field of ["id", "name", "summary", "version", "defaultLocale"]) {
    if (!text(manifest[field])) throw new MetadataError(`Missing or invalid ${field}`);
  }
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(manifest.id)) throw new MetadataError("Invalid world id");
  if (manifest.version.length > 100) throw new MetadataError("Version exceeds 100 characters");
  if (!Array.isArray(manifest.supportedLocales) || !manifest.supportedLocales.length || manifest.supportedLocales.length > 20 ||
    !manifest.supportedLocales.every((locale) => typeof locale === "string" && LOCALE.test(locale)) ||
    !manifest.supportedLocales.includes(manifest.defaultLocale)) throw new MetadataError("Invalid supportedLocales");
  const entry = candidate(repo, { ...options, packagePath: item.path });
  const prefix = item.path ? `${item.path}/` : "";
  const problems = [];
  if (!item.files.has(`${prefix}WORLD.md`)) problems.push("missing-lore");
  if (!semver.valid(manifest.version)) problems.push("invalid-version");
  // No authoritative host-range field exists in the current world manifest.
  // Schema URLs or legacy directory claims do not establish compatibility.
  const tags = Array.isArray(manifest.tags) ? [...new Set(manifest.tags.map((tag) => text(tag, 100)).filter(Boolean))].slice(0, 50) : [];
  Object.assign(entry, {
    id: manifest.id, name: text(manifest.name, 200), description: text(manifest.summary),
    version: manifest.version, author: text(manifest.author?.name ?? manifest.author, 200) ?? entry.author,
    license: text(manifest.license, 200) ?? entry.license, pluginPreset: text(manifest.pluginPolicy?.presetId, 200),
    locales: [...new Set(manifest.supportedLocales)], tags,
    category: CATEGORIES.find((category) => tags.includes(category)) ?? "other",
    status: repo.archived ? "archived" : problems.length ? "pending" : "indexed", problems,
    readmeUrl: item.files.has(`${prefix}README.md`)
      ? `${entry.repositoryUrl}/blob/${encodeURIComponent(entry.commitSha ?? entry.sourceRef.name)}/${encodedPath(`${prefix}README.md`)}`
      : entry.readmeUrl,
  });
  if (entry.status === "indexed") {
    const suffix = item.path ? `/${encodedPath(item.path)}` : "";
    entry.installUrl = `${entry.repositoryUrl}/tree/${encodeURIComponent(entry.sourceRef.name)}${suffix}`;
    entry.pinnedUrl = entry.commitSha ? `${entry.repositoryUrl}/tree/${entry.commitSha}${suffix}` : null;
  }
  return { entry, defaultLocale: manifest.defaultLocale };
}

export async function extractWorlds({ repo, tree, read, config, discovery, commitSha = null, fetchedAt = null }) {
  const items = findWorlds(tree);
  if (items.length > config.maxWorldsPerRepository) throw new github.GitHubError(`${repo.full_name}: world count exceeds the configured limit`);
  const entries = [];
  const issues = [];
  for (const item of items) {
    let sourceTreeHash = null;
    if (discovery !== "local") {
      try { sourceTreeHash = fingerprintTree(tree, item.path); }
      catch { throw new github.GitHubError(`${repo.full_name}: invalid package tree`); }
    }
    const options = { config, discovery, commitSha, sourceTreeHash, fetchedAt };
    let result;
    try { result = normalizeWorld(await read(item.files.get(item.manifestPath)), item, repo, options); }
    catch (error) {
      if (!(error instanceof MetadataError)) throw error;
      entries.push(candidate(repo, { ...options, packagePath: item.path, problems: ["invalid-manifest"] }));
      issues.push({ repository: repo.full_name, path: item.path, message: error.message });
      continue;
    }
    const { entry, defaultLocale } = result;
    for (const locale of entry.locales.filter((locale) => locale !== defaultLocale)) {
      const filename = item.manifestPath.replace(/world\.yaml$/, `world.${locale}.yaml`);
      const file = item.files.get(filename);
      if (!file) continue;
      try {
        const data = parseYaml(await read(file));
        const name = text(data.name, 200);
        const description = text(data.summary);
        if (!name && !description) throw new MetadataError("Translation has no display text");
        entry.translations[locale] = { ...(name && { name }), ...(description && { description }) };
      } catch (error) {
        if (!(error instanceof MetadataError)) throw error;
        issues.push({ repository: repo.full_name, path: item.path, message: `Invalid ${locale} translation; using base text` });
      }
    }
    entries.push(entry);
    for (const problem of entry.problems) issues.push({ repository: repo.full_name, path: item.path, message: problem });
  }
  if (!items.length) entries.push(candidate(repo, { config, discovery, commitSha, fetchedAt, problems: ["missing-manifest"] }));
  return { entries, issues };
}
