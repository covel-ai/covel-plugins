import { parseDocument } from "yaml";
import semver from "semver";
import path from "node:path";
import { MetadataError, GitHubError, MAX_FILE_BYTES, repositoryPath } from "../src/github.mjs";
import { packageKey, safePath, fingerprintTree } from "../src/hash.mjs";

const CATEGORIES = ["narrative", "gameplay", "world", "media", "tools", "authoring", "other"];
const text = (value, max = 4000) => typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
const localePattern = /^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-[A-Z]{2})?$/;
export function parseYaml(source) {
  if (Buffer.byteLength(source) > MAX_FILE_BYTES) throw new MetadataError("Metadata exceeds 256 KiB");
  const document = parseDocument(source, { schema: "core", uniqueKeys: true, strict: true });
  if (document.errors.length || document.warnings.length) throw new MetadataError("Invalid YAML or unsupported YAML tag");
  let value;
  try { value = document.toJS({ maxAliasCount: 0 }); } catch { throw new MetadataError("YAML aliases are not accepted"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new MetadataError("Metadata must be an object");
  return value;
}
export function parseManifest(source) {
  if (Buffer.byteLength(source) > MAX_FILE_BYTES) throw new MetadataError("Manifest exceeds 256 KiB");
  const match = source.replace(/^\uFEFF/, "").match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new MetadataError("PLUGIN.md needs YAML frontmatter");
  return parseYaml(match[1]);
}
function parsePackage(source) {
  if (Buffer.byteLength(source) > MAX_FILE_BYTES) throw new MetadataError("Package metadata exceeds 256 KiB");
  let pkg; try { pkg = JSON.parse(source); } catch { throw new MetadataError("Invalid package.json"); }
  if (!pkg || typeof pkg !== "object" || Array.isArray(pkg)) throw new MetadataError("Expected package.json object");
  return pkg;
}
export function findPackages(tree) {
  const files = new Map();
  for (const file of tree) {
    if (file.type !== "blob" || !/^100(644|755)$/.test(file.mode) || !safePath(file.path) || file.path.split("/").some((part) => [".git", "node_modules"].includes(part))) continue;
    if (files.has(file.path)) throw new GitHubError("Duplicate Git path in package tree");
    files.set(file.path, file);
  }
  return [...files.keys()].filter((file) => path.posix.basename(file) === "PLUGIN.md")
    .filter((file) => !file.split("/").some((part) => ["vendor", "runtimes"].includes(part)))
    .map((file) => ({ path: path.posix.dirname(file) === "." ? "" : path.posix.dirname(file), files })).sort((a, b) => a.path.localeCompare(b.path));
}
export function githubUrl(repository, kind, ref, packagePath = "") {
  const suffix = packagePath ? `/${packagePath.split("/").map(encodeURIComponent).join("/")}` : "";
  return `https://github.com/${repository}/${kind}/${encodeURIComponent(ref)}${suffix}`;
}
export function candidate(repo, { config, discovery, packagePath = null, commitSha = null, sourceTreeHash = null, fetchedAt = null, problems = [] }) {
  repositoryPath(repo.full_name);
  const repositoryId = discovery === "local" ? null : repo.id;
  return {
    key: packageKey(repositoryId, "plugins", packagePath), kind: "plugins",
    id: (packagePath?.split("/").at(-1) || repo.name || repo.full_name.split("/")[1]).slice(0, 200),
    name: (packagePath?.split("/").at(-1) || repo.name || repo.full_name.split("/")[1]).slice(0, 200), description: text(repo.description) ?? "",
    repositoryId, ownerId: Number.isSafeInteger(repo.owner?.id) && repo.owner.id > 0 ? repo.owner.id : null,
    repository: repo.full_name, repositoryUrl: `https://github.com/${repo.full_name}`, author: repo.owner?.login ?? repo.full_name.split("/")[0], path: packagePath,
    sourceRef: { type: "branch", name: repo.default_branch || "main" }, commitSha, sourceTreeHash, contentHash: null, hashScheme: null,
    version: null, covelVersion: null, license: repo.license?.spdx_id === "NOASSERTION" ? null : text(repo.license?.spdx_id, 200),
    category: "other", tags: [], locales: [], translations: {},
    official: config.officialRepositories.some((name) => name.toLowerCase() === repo.full_name.toLowerCase()), discovery, fork: repo.fork === true,
    status: repo.archived ? "archived" : "pending", problems,
    stars: Number.isSafeInteger(repo.stargazers_count) && repo.stargazers_count >= 0 ? repo.stargazers_count : null,
    downloadRequests: null, releasePublishedAt: null, firstSeenAt: null, contentChangedAt: null, fetchedAt,
    installUrl: null, pinnedUrl: null, readmeUrl: githubUrl(repo.full_name, "tree", commitSha ?? repo.default_branch ?? "main", packagePath ?? ""),
  };
}
function metadataProblems(manifest, pkg, packagePath) {
  const problems = [];
  if (typeof manifest.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(manifest.id)) throw new MetadataError("Invalid plugin id");
  if (manifest.kind !== "plugin") throw new MetadataError("Manifest kind must be plugin");
  if (packagePath && path.posix.basename(packagePath) !== manifest.id) problems.push("directory-id-mismatch");
  if (!text(pkg.name) || pkg.type !== "module") problems.push("invalid-package");
  if (typeof manifest.version !== "string" || manifest.version.length > 100) throw new MetadataError("Version must be a string of at most 100 characters");
  if (!semver.valid(manifest.version)) problems.push("invalid-version");
  if (pkg.version !== manifest.version) problems.push("version-mismatch");
  for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) if (pkg[field] && (typeof pkg[field] !== "object" || Object.keys(pkg[field]).length)) problems.push("requires-build");
  if (!text(manifest.covel, 200) || !semver.validRange(manifest.covel)) problems.push("missing-compatibility");
  return problems;
}
export async function extractPlugins({ repo, tree, read, config, discovery, commitSha = null, fetchedAt = null, overrides = [] }) {
  const items = findPackages(tree);
  if (items.length > config.maxPluginsPerRepository) throw new GitHubError(`${repo.full_name}: package count exceeds configured limit`);
  const entries = [], issues = [];
  for (const item of items) {
    const sourceTreeHash = discovery === "local" ? null : fingerprintTree(tree, item.path);
    const entry = candidate(repo, { config, discovery, packagePath: item.path, commitSha, sourceTreeHash, fetchedAt });
    const prefix = item.path ? `${item.path}/` : "";
    try {
      const manifest = parseManifest(await read(item.files.get(`${prefix}PLUGIN.md`)));
      if (!item.files.has(`${prefix}package.json`)) throw new MetadataError("Missing package.json beside PLUGIN.md");
      const pkg = parsePackage(await read(item.files.get(`${prefix}package.json`)));
      const problems = metadataProblems(manifest, pkg, item.path);
      const license = text(manifest.license, 200) ?? text(pkg.license, 200) ?? entry.license;
      if (!license || ["UNLICENSED", "NOASSERTION"].includes(license)) problems.push("missing-license");
      const legacy = overrides.find((o) => o.repository.toLowerCase() === entry.repositoryUrl.toLowerCase() && o.path === item.path);
      const tags = Array.isArray(manifest.tags) ? [...new Set(manifest.tags.map((v) => text(v, 100)).filter(Boolean))].slice(0, 50) : [];
      const category = CATEGORIES.find((c) => tags.includes(c) || (repo.topics ?? []).includes(`covel-plugin-${c}`)) ?? legacy?.category ?? "other";
      const locales = [...new Set(["en-US", ...[...item.files.keys()].filter((f) => f.startsWith(`${prefix}locales/`) && /\.(yaml|yml)$/.test(f)).map((f) => path.posix.basename(f).replace(/\.ya?ml$/, "")).filter((l) => localePattern.test(l)).map((l) => l === "zh" ? "zh-CN" : l)])].sort().slice(0, 30);
      Object.assign(entry, { id: manifest.id, name: text(manifest.displayName, 200) ?? text(pkg.name, 200) ?? manifest.id,
        description: text(manifest.description) ?? text(pkg.description) ?? entry.description, version: manifest.version, covelVersion: text(manifest.covel, 200),
        license, tags, category, locales, problems, status: repo.archived ? "archived" : problems.length ? "pending" : "indexed",
        ...(legacy ? { legacyMetadata: { covelVersion: legacy.covelVersion ?? null, notes: text(legacy.notes) ?? "" } } : {}),
      });
      for (const locale of locales.filter((l) => l !== "en-US")) {
        const file = [locale, ...(locale === "zh-CN" ? ["zh"] : [])].flatMap((l) => ["yaml", "yml"].map((ext) => item.files.get(`${prefix}locales/${l}.${ext}`))).find(Boolean);
        if (!file) continue;
        try {
          const labels = parseYaml(await read(file))["PLUGIN.md"];
          const name = text(labels?.displayName, 200), description = text(labels?.description);
          if (name || description) entry.translations[locale] = { ...(name ? { name } : {}), ...(description ? { description } : {}) };
        } catch (error) { if (!(error instanceof MetadataError)) throw error; issues.push({ repository: repo.full_name, path: item.path, message: `Invalid ${locale} labels; using base text` }); }
      }
      const readme = [`${prefix}README.md`, "README.md"].find((file) => item.files.has(file));
      if (readme) entry.readmeUrl = githubUrl(repo.full_name, "blob", commitSha ?? entry.sourceRef.name, readme);
      if (entry.status === "indexed") { entry.installUrl = githubUrl(repo.full_name, "tree", entry.sourceRef.name, item.path); entry.pinnedUrl = commitSha ? githubUrl(repo.full_name, "tree", commitSha, item.path) : null; }
    } catch (error) {
      if (!(error instanceof MetadataError)) throw error;
      entry.problems.push("invalid-manifest");
      issues.push({ repository: repo.full_name, path: item.path, message: error.message });
    }
    entries.push(entry);
    for (const problem of entry.problems) issues.push({ repository: repo.full_name, path: item.path, message: problem });
  }
  if (!items.length) entries.push(candidate(repo, { config, discovery, commitSha, fetchedAt, problems: ["missing-manifest"] }));
  return { entries, issues };
}

/** Checks the import layout without evaluating third-party JavaScript. Full Covel
 * contract and permission validation is still the installer's responsibility. */
export function validatePluginPackage(files, entry) {
  const source = (name) => { const file = files.get(name); const bytes = file instanceof Uint8Array ? file : file?.data; if (!bytes) throw new MetadataError(`Missing ${name} at ZIP root`); return Buffer.from(bytes).toString("utf8"); };
  const manifest = parseManifest(source("PLUGIN.md")), pkg = parsePackage(source("package.json"));
  const problems = metadataProblems(manifest, pkg, entry.path);
  if (problems.length || manifest.id !== entry.id || manifest.version !== entry.version || manifest.covel !== entry.covelVersion) throw new MetadataError("Plugin manifest differs from its indexed revision or needs a build");
  function requireFile(filename) {
    if (typeof filename !== "string") throw new MetadataError("Invalid package file reference");
    const normalized = filename.replace(/^\.\//, "");
    if (!safePath(normalized) || !files.has(normalized)) throw new MetadataError(`Missing or unsafe package file: ${filename}`);
    return normalized;
  }
  if (manifest.entry !== undefined) {
    const filename = requireFile(manifest.entry);
    if (!/\.(?:js|mjs|cjs)$/.test(filename)) throw new MetadataError("Plugin entry must be runnable JavaScript");
  }
  for (const paths of Object.values(manifest.contributes?.ui ?? {})) for (const filename of Array.isArray(paths) ? paths : [paths]) requireFile(filename);
  const stores = manifest.contributes?.stores ?? [];
  if (!Array.isArray(stores)) throw new MetadataError("Invalid stores declaration");
  for (const store of stores) if (store.schema) requireFile(store.schema);
  function checkRuntime(runtime, directory = "") {
    if (!runtime || typeof runtime !== "object" || !["function", "agent"].includes(runtime.type)) throw new MetadataError("Invalid runtime declaration");
    const relativeFile = (value) => {
      if (typeof value !== "string") throw new MetadataError("Invalid runtime file reference");
      const relative = value.replace(/^\.\//, "");
      if (!safePath(relative)) throw new MetadataError("Unsafe runtime file reference");
      return requireFile(directory ? `${directory}/${relative}` : relative);
    };
    if (runtime.type === "function") {
      const handler = relativeFile(runtime.function?.handler);
      if (!/\.(?:js|mjs|cjs)$/.test(handler)) throw new MetadataError("Runtime handler must be runnable JavaScript");
    }
    for (const input of Object.values(runtime.io?.inputs ?? {})) if (typeof input?.accepts === "string" && input.accepts.startsWith(".")) relativeFile(input.accepts);
  }
  if (manifest.runtime) checkRuntime(manifest.runtime);
  for (const file of files.keys()) if (/^runtimes\/[^/]+\/RUNTIME\.md$/.test(file)) checkRuntime(parseManifest(source(file)), path.posix.dirname(file));
  for (const file of files.keys()) if (file !== "PLUGIN.md" && /(^|\/)PLUGIN\.md$/.test(file)) throw new MetadataError("Nested PLUGIN.md is not a grouped runtime manifest");
  if (!manifest.entry && !manifest.runtime && ![...files.keys()].some((f) => /^runtimes\/[^/]+\/RUNTIME\.md$/.test(f))) throw new MetadataError("Plugin has no entry or runtime");
}
