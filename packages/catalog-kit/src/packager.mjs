import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename, rm, lstat } from "node:fs/promises";
import path from "node:path";
import { zip } from "fflate";
import { parseDocument } from "yaml";
import { fingerprintFiles, fingerprintTree, HASH_SCHEME, PACKAGER_VERSION, safePath, sha256 } from "./hash.mjs";
import { GitHubError, MetadataError } from "./github.mjs";

export const PACKAGING_LIMITS = Object.freeze({ maxFiles: 2000, maxUnpackedBytes: 200 * 1024 * 1024, maxZipBytes: 20 * 1024 * 1024 });
const canonicalRef = (value) => typeof value === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);

function packageFiles(tree, packagePath, limits) {
  if (packagePath !== "" && !safePath(packagePath)) throw new MetadataError("Invalid package directory");
  const prefix = packagePath ? `${packagePath}/` : "";
  const files = new Map();
  let total = 0;
  for (const file of tree) {
    if (!file.path.startsWith(prefix) || file.type === "tree") continue;
    const relative = file.path.slice(prefix.length);
    // A Git path can be valid on Linux but unsafe when imported on Windows.
    if (!safePath(relative) || relative.split("/").some((part) => /[<>:"|?*]/.test(part) || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new MetadataError("Archive contains an unsafe or nonportable path");
    if (file.type !== "blob" || !/^100(644|755)$/.test(file.mode) || !canonicalRef(file.sha)) throw new MetadataError("Archives cannot contain symlinks or submodules");
    if (!Number.isSafeInteger(file.size) || file.size < 0) throw new MetadataError("Git file is missing a valid size");
    if (files.has(relative)) throw new MetadataError("Archive contains duplicate paths");
    files.set(relative, file);
    total += file.size;
    if (files.size > limits.maxFiles || total > limits.maxUnpackedBytes) throw new MetadataError("Package exceeds archive file or byte limits");
  }
  if (!files.size) throw new MetadataError("Package directory is empty");
  // A case-insensitive client must not receive two different files at one path.
  const folded = [...files.keys()].map((name) => name.normalize("NFC").toLowerCase());
  if (new Set(folded).size !== files.size) throw new MetadataError("Archive contains ambiguous case or Unicode paths");
  const filePaths = new Set(folded);
  for (const name of folded) {
    const parts = name.split("/");
    for (let count = 1; count < parts.length; count++) {
      if (filePaths.has(parts.slice(0, count).join("/"))) throw new MetadataError("Archive contains a file/directory path conflict");
    }
  }
  return [...files].sort(([a], [b]) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
}

async function bytesFor(get, repository, file, limits) {
  const blob = await get(`/repos/${repository}/git/blobs/${file.sha}`, {
    immutable: true,
    responseLimitBytes: Math.min(300 * 1024 * 1024, Math.ceil(file.size * 1.5) + 4096),
  });
  if (blob.encoding !== "base64" || typeof blob.content !== "string" || blob.content.length > Math.ceil(file.size * 1.5) + 100 || (blob.size !== undefined && blob.size !== file.size)) throw new MetadataError("Git blob encoding or size differs from its tree");
  const encoded = blob.content.replace(/\s/g, "");
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw new MetadataError("Invalid blob base64");
  const data = Buffer.from(encoded, "base64");
  if (data.length !== file.size || data.length > limits.maxUnpackedBytes) throw new MetadataError("Git blob byte size does not match its tree");
  const objectHash = createHash(file.sha.length === 64 ? "sha256" : "sha1").update(`blob ${data.length}\0`).update(data).digest("hex");
  if (objectHash !== file.sha) throw new MetadataError("Git blob content hash does not match its tree");
  return data;
}

function yamlObject(bytes) {
  if (!bytes || bytes.byteLength > 256 * 1024) throw new MetadataError("World manifest is missing or oversized");
  const document = parseDocument(Buffer.from(bytes).toString("utf8"), { uniqueKeys: true });
  if (document.errors.length || document.warnings.length) throw new MetadataError("Invalid world YAML");
  let object;
  try { object = document.toJS({ maxAliasCount: 20 }); }
  catch { throw new MetadataError("Invalid world YAML aliases"); }
  if (!object || typeof object !== "object" || Array.isArray(object)) throw new MetadataError("Invalid world manifest object");
  return object;
}

export function validateWorldPackage(files, entry) {
  const content = (name) => { const value = files.get(name); return value instanceof Uint8Array ? value : value?.data; };
  const manifest = yamlObject(content("world.yaml"));
  if (manifest.schemaVersion !== "1.0" || manifest.id !== entry.id || manifest.version !== entry.version || typeof manifest.name !== "string" || typeof manifest.summary !== "string") throw new MetadataError("World manifest differs from its indexed revision");
  if (!content("WORLD.md")) throw new MetadataError("World package is missing WORLD.md at ZIP root");
  if (!Array.isArray(manifest.supportedLocales) || !manifest.supportedLocales.includes(manifest.defaultLocale)) throw new MetadataError("World package has invalid locales");
  const requirePath = (filename) => {
    if (!safePath(filename) || !files.has(filename)) throw new MetadataError("World references a missing or unsafe package file");
  };
  for (const field of ["cover", "themeMusic", "worldData"]) if (manifest[field] !== undefined) requirePath(manifest[field]);
  if (manifest.worldData) {
    const descriptor = yamlObject(content(manifest.worldData));
    if (!descriptor.sources || typeof descriptor.sources !== "object" || Array.isArray(descriptor.sources)) throw new MetadataError("Invalid world data descriptor");
    for (const source of Object.values(descriptor.sources)) requirePath(source?.path);
  }
}

/** No package-specific validator means no archive, rather than distributing a
 * syntactically valid ZIP that Covel cannot import. */
export function createPackager({ get, cacheDir, validatePackage, limits = PACKAGING_LIMITS, maxConcurrent = 2 }) {
  if (typeof get !== "function" || typeof validatePackage !== "function" || !cacheDir) throw new Error("Packager requires API, private cache and a package validator");
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) throw new Error("Invalid packaging concurrency");
  for (const [name, maximum] of Object.entries(PACKAGING_LIMITS)) {
    if (!Number.isSafeInteger(limits[name]) || limits[name] < 1 || limits[name] > maximum) throw new Error(`Invalid packaging limit: ${name}`);
  }
  const flights = new Map();
  const queue = [];
  let active = 0;
  async function limited(work) {
    if (active >= maxConcurrent) await new Promise((resolve) => queue.push(resolve));
    else active++;
    try { return await work(); }
    finally {
      const next = queue.shift();
      if (next) next();
      else active--;
    }
  }
  async function liveRepository(entry) {
    if (!Number.isSafeInteger(entry.repositoryId) || entry.repositoryId < 1 || entry.path === null || !canonicalRef(entry.commitSha) || !/^[a-f0-9]{64}$/.test(entry.sourceTreeHash ?? "") || entry.status !== "indexed") throw new MetadataError("Entry has no distributable pinned revision");
    const repo = await get(`/repositories/${entry.repositoryId}`, { optional: true });
    if (!repo || repo.private !== false || repo.disabled || repo.archived || repo.id !== entry.repositoryId) throw new MetadataError("Repository is unavailable for distribution");
    if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(repo.full_name)) throw new GitHubError("Invalid live repository identity");
    if (entry.ownerId === null || repo.owner?.id !== entry.ownerId) throw new MetadataError("Repository ownership changed; refresh the directory before downloading");
    return repo;
  }
  async function build(entry, repo, cacheKey) {
    await mkdir(cacheDir, { recursive: true, mode: 0o700 });
    const manifestPath = path.join(cacheDir, `${cacheKey}.json`);
    try {
      const record = JSON.parse(await readFile(manifestPath, "utf8"));
      if (record.cacheKey !== cacheKey || record.sourceTreeHash !== entry.sourceTreeHash || record.hashScheme !== HASH_SCHEME || record.packagerVersion !== PACKAGER_VERSION || !/^[a-f0-9]{64}\.zip$/.test(record.storageKey) || !/^[a-f0-9]{64}$/.test(record.contentHash)) throw new Error("Invalid artifact cache record");
      if (typeof record.entryId !== "string" || !Object.hasOwn(record, "entryVersion")) throw new Error("Invalid cached package identity");
      if (record.entryId !== entry.id || record.entryVersion !== entry.version) throw new MetadataError("Cached package identity differs from its indexed revision");
      const filename = path.join(cacheDir, record.storageKey);
      const stat = await lstat(filename);
      if (!stat.isFile() || stat.size > limits.maxZipBytes) throw new Error("Invalid cached artifact file");
      const bytes = await readFile(filename);
      if (bytes.byteLength !== record.size || bytes.byteLength > limits.maxZipBytes || sha256(bytes) !== record.artifactSha256) throw new Error("Cached artifact checksum differs");
      if (entry.contentHash && entry.contentHash !== record.contentHash) throw new MetadataError("Cached package content differs from its revision");
      const { cacheKey: _cacheKey, sourceTreeHash: _tree, entryId: _id, entryVersion: _version, ...artifact } = record;
      return artifact;
    } catch (error) {
      if (error instanceof MetadataError) throw error;
      if (!(["ENOENT"].includes(error.code) || error instanceof SyntaxError || error.message.startsWith("Invalid") || error.message.startsWith("Cached"))) throw error;
    }
    const commit = await get(`/repos/${repo.full_name}/commits/${entry.commitSha}`, { immutable: true });
    if (commit.sha !== entry.commitSha || !canonicalRef(commit.commit?.tree?.sha)) throw new MetadataError("Commit resolution changed during packaging");
    const response = await get(`/repos/${repo.full_name}/git/trees/${commit.commit.tree.sha}?recursive=1`, { immutable: true });
    if (response.truncated !== false || !Array.isArray(response.tree)) throw new GitHubError("Incomplete package Git tree");
    if (fingerprintTree(response.tree, entry.path) !== entry.sourceTreeHash) throw new MetadataError("Package source differs from the indexed file tree");
    const files = new Map();
    for (const [relative, file] of packageFiles(response.tree, entry.path, limits)) files.set(relative, { data: await bytesFor(get, repo.full_name, file, limits), mode: file.mode });
    await validatePackage(entry.kind, files, entry);
    const contentHash = fingerprintFiles(files);
    if (entry.contentHash && contentHash !== entry.contentHash) throw new MetadataError("Package content differs from its recorded revision");
    const zipInput = Object.create(null);
    for (const [relative, file] of files) zipInput[relative] = [file.data, {
      // ZIP has local calendar fields: a local fixed date stays identical across TZs.
      mtime: new Date(1980, 0, 1, 0, 0, 0), os: 3,
      attrs: (file.mode === "100755" ? 0o100755 : 0o100644) << 16,
    }];
    const bytes = await new Promise((resolve, reject) => zip(zipInput, { level: 6 }, (error, result) => error ? reject(error) : resolve(result)));
    if (bytes.length > limits.maxZipBytes) throw new MetadataError("Compressed package exceeds the ZIP byte limit");
    const artifactSha256 = sha256(bytes);
    const storageKey = `${artifactSha256}.zip`;
    const safeName = `${entry.id}-${entry.version ?? entry.commitSha.slice(0, 12)}`.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 160);
    const artifact = { artifactSha256, contentHash, hashScheme: HASH_SCHEME, packagerVersion: PACKAGER_VERSION, size: bytes.length, filename: `${safeName || "covel-package"}.zip`, storageKey };
    const temporary = path.join(cacheDir, `${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, bytes, { mode: 0o600 });
      await rename(temporary, path.join(cacheDir, storageKey));
      const metadataTemporary = `${manifestPath}.${randomUUID()}.tmp`;
      try {
        await writeFile(metadataTemporary, JSON.stringify({ cacheKey, sourceTreeHash: entry.sourceTreeHash, entryId: entry.id, entryVersion: entry.version, ...artifact }), { mode: 0o600 });
        await rename(metadataTemporary, manifestPath);
      } finally { await rm(metadataTemporary, { force: true }); }
    } finally { await rm(temporary, { force: true }); }
    return artifact;
  }
  return {
    async prepare(entry) {
      // Even a single-flight join or an artifact hit must verify current identity.
      const repo = await liveRepository(entry);
      const cacheKey = sha256(JSON.stringify([entry.repositoryId, entry.kind, entry.path, entry.commitSha, PACKAGER_VERSION]));
      if (!flights.has(cacheKey)) {
        const flight = limited(() => build(entry, repo, cacheKey));
        flights.set(cacheKey, { promise: flight, entryId: entry.id, version: entry.version, sourceTreeHash: entry.sourceTreeHash });
        flight.finally(() => flights.delete(cacheKey)).catch(() => {});
      }
      const flight = flights.get(cacheKey);
      if (flight.entryId !== entry.id || flight.version !== entry.version || flight.sourceTreeHash !== entry.sourceTreeHash) throw new MetadataError("Concurrent package identity differs from its indexed revision");
      const artifact = await flight.promise;
      if (entry.contentHash && artifact.contentHash !== entry.contentHash) throw new MetadataError("Package content differs from its recorded revision");
      return artifact;
    },
  };
}
