import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const ORIGIN = "https://api.github.com";
const API_VERSION = "2022-11-28";
const REPOSITORY = /^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/;
export const MAX_FILE_BYTES = 256 * 1024;
export class MetadataError extends Error {}
export class GitHubError extends Error {
  constructor(message, status = 0) { super(message); this.name = "GitHubError"; this.status = status; }
}

export function repositoryPath(name) {
  if (typeof name !== "string" || !REPOSITORY.test(name)) throw new MetadataError("Invalid repository name");
  return `/repos/${name}`;
}

function apiUrl(endpoint) {
  if (typeof endpoint !== "string" || !endpoint.startsWith("/") || endpoint.startsWith("//") || /[\\\x00-\x20\x7f]/.test(endpoint)) throw new GitHubError("Expected a GitHub API path");
  const url = new URL(endpoint, ORIGIN);
  if (url.origin !== ORIGIN || url.username || url.password || url.hash) throw new GitHubError("Unexpected API origin");
  return url;
}

export function memoryCache() {
  const values = new Map();
  return { get: async (key) => values.get(key), set: async (key, value) => { values.set(key, value); } };
}

// Stores public API bodies and validators, never request headers or credentials.
// Each successful fetch is checkpointed, making a rate-limited run resumable.
export function diskCache(directory) {
  const file = (key) => path.join(directory, `${createHash("sha256").update(`${API_VERSION}:${key}`).digest("hex")}.json`);
  return {
    async get(key) {
      try { return JSON.parse(await readFile(file(key), "utf8")); }
      catch (error) { if (error.code === "ENOENT" || error instanceof SyntaxError) return undefined; throw error; }
    },
    async set(key, value) {
      await mkdir(directory, { recursive: true });
      const target = file(key);
      const temporary = `${target}.${process.pid}.tmp`;
      await writeFile(temporary, JSON.stringify(value));
      await rename(temporary, target);
    },
  };
}

async function jsonBody(response, maxBytes) {
  const length = Number(response.headers.get("content-length"));
  if (length > maxBytes) throw new GitHubError("GitHub response exceeds the byte limit", response.status);
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of response.body ?? []) {
      size += chunk.byteLength;
      if (size > maxBytes) throw new GitHubError("GitHub response exceeds the byte limit", response.status);
      chunks.push(Buffer.from(chunk));
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof GitHubError) throw error;
    throw new GitHubError("GitHub response is incomplete or invalid JSON", response.status);
  }
}

/** A serialized, bounded, conditionally cached GitHub JSON client. */
export function createGitHubClient({
  token = process.env.GITHUB_TOKEN,
  fetchImpl = fetch,
  cache = memoryCache(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = () => Date.now(),
  maxRequests = 4500,
  maxWaitMs = 60000,
  maxResponseBytes = 32 * 1024 * 1024,
} = {}) {
  let tail = Promise.resolve();
  let requests = 0;
  let remaining = null;
  let resetAt = null;
  async function run(endpoint, { optional = false, immutable = false, responseLimitBytes = maxResponseBytes } = {}) {
    if (!Number.isSafeInteger(responseLimitBytes) || responseLimitBytes < 1 || responseLimitBytes > 300 * 1024 * 1024) throw new GitHubError("Invalid GitHub response byte limit");
    let url = apiUrl(endpoint);
    let redirects = 0;
    let attempt = 0;
    let unconditional = false;
    for (;;) {
      const key = url.href;
      const cached = await cache.get(key);
      const hasBody = cached && Object.hasOwn(cached, "body");
      if (immutable && hasBody) return structuredClone(cached.body);
      if (remaining === 0 && resetAt && resetAt > now()) {
        const wait = resetAt - now() + 1000;
        if (wait > maxWaitMs) throw new GitHubError("GitHub request budget exhausted; resume from checkpoints after reset", 429);
        await sleep(wait);
        remaining = null;
      }
      if (++requests > maxRequests) throw new GitHubError("Collection request budget exhausted; resume from checkpoints", 429);
      const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": API_VERSION, "User-Agent": "covel-catalog-kit" };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (!unconditional && cached?.etag) headers["If-None-Match"] = cached.etag;
      let response;
      try {
        response = await fetchImpl(url, { headers, redirect: "manual", signal: AbortSignal.timeout(30000) });
      } catch {
        if (++attempt >= 3) throw new GitHubError(`GitHub request failed: ${url.pathname}`);
        await sleep(1000 * 2 ** (attempt - 1));
        continue;
      }
      const remainingHeader = response.headers.get("x-ratelimit-remaining");
      const resetHeader = response.headers.get("x-ratelimit-reset");
      if (remainingHeader !== null && Number.isFinite(Number(remainingHeader))) remaining = Number(remainingHeader);
      if (resetHeader !== null && Number.isFinite(Number(resetHeader))) resetAt = Number(resetHeader) * 1000;
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location || ++redirects > 3) throw new GitHubError("Invalid or excessive GitHub redirects", response.status);
        const next = new URL(location, url);
        if (next.origin !== ORIGIN || next.username || next.password || next.hash) throw new GitHubError("Refusing cross-origin GitHub API redirect", response.status);
        url = apiUrl(`${next.pathname}${next.search}`);
        unconditional = false;
        continue;
      }
      if (response.status === 304) {
        if (hasBody) return structuredClone(cached.body);
        if (unconditional) throw new GitHubError("GitHub returned 304 without a cached representation", 304);
        unconditional = true;
        continue;
      }
      if (optional && response.status === 404) { await response.body?.cancel(); return null; }
      const rateLimited = response.status === 429 || (response.status === 403 &&
        (response.headers.has("retry-after") || remaining === 0));
      if (rateLimited || response.status >= 500) {
        await response.body?.cancel();
        if (++attempt >= 3) throw new GitHubError(`GitHub HTTP ${response.status}: ${url.pathname}`, response.status);
        const retryAfter = response.headers.get("retry-after");
        const requestedWait = retryAfter === null ? null : Number(retryAfter);
        const wait = requestedWait !== null && Number.isFinite(requestedWait)
          ? Math.max(1000, requestedWait * 1000)
          : remaining === 0 && resetAt ? Math.max(1000, resetAt - now() + 1000)
          : rateLimited ? 60000 * 2 ** (attempt - 1) : 1000 * 2 ** (attempt - 1);
        if (wait > maxWaitMs) throw new GitHubError("GitHub rate limited collection; preserving the last complete snapshot", response.status);
        await sleep(wait);
        // The retry delay already accounted for this reset.
        if (remaining === 0) remaining = null;
        continue;
      }
      if (!response.ok) { await response.body?.cancel(); throw new GitHubError(`GitHub HTTP ${response.status}: ${url.pathname}`, response.status); }
      const body = await jsonBody(response, responseLimitBytes);
      if (body?.private !== true) await cache.set(key, { etag: response.headers.get("etag"), body });
      return body;
    }
  }
  function get(endpoint, options) {
    const result = tail.then(() => run(endpoint, options));
    tail = result.catch(() => {});
    return result;
  }
  get.stats = () => ({ requests, remaining, resetAt });
  return get;
}

function checkSearch(data) {
  if (data?.incomplete_results !== false || !Number.isSafeInteger(data.total_count) || data.total_count < 0 || !Array.isArray(data.items)) throw new GitHubError("Incomplete or invalid GitHub search; refusing a partial catalog");
  for (const repo of data.items) {
    if (!Number.isSafeInteger(repo.id) || repo.id <= 0 || typeof repo.full_name !== "string" || !REPOSITORY.test(repo.full_name)) throw new GitHubError("Invalid repository search result");
  }
}

/** OR topic discovery; returns current search names deduplicated by numeric ID. */
export async function discoverRepositories(get, topics, { now = new Date() } = {}) {
  if (!Array.isArray(topics) || !topics.length || !topics.every((topic) => /^[a-z0-9][a-z0-9-]{0,49}$/.test(topic))) throw new MetadataError("Invalid discovery topics");
  const found = new Map();
  const start = Date.parse("2008-01-01T00:00:00Z") / 1000;
  const end = Math.floor(new Date(now).getTime() / 1000);
  if (!Number.isFinite(end) || end < start) throw new MetadataError("Invalid discovery time");
  const iso = (seconds) => new Date(seconds * 1000).toISOString().replace(".000Z", "Z");
  async function range(topic, low, high) {
    const query = `topic:${topic} is:public fork:true created:${iso(low)}..${iso(high)}`;
    const search = new URLSearchParams({ q: query, sort: "updated", order: "asc", per_page: "100" });
    const endpoint = `/search/repositories?${search}`;
    const first = await get(`${endpoint}&page=1`);
    checkSearch(first);
    if (first.total_count > 1000) {
      if (low >= high) throw new GitHubError(`topic:${topic} exceeds the search limit within one second; refusing truncation`);
      const mid = Math.floor((low + high) / 2);
      await range(topic, low, mid);
      await range(topic, mid + 1, high);
      return;
    }
    const partition = new Map();
    for (let page = 1; page <= Math.max(1, Math.ceil(first.total_count / 100)); page++) {
      const data = page === 1 ? first : await get(`${endpoint}&page=${page}`);
      checkSearch(data);
      if (data.total_count !== first.total_count) throw new GitHubError("Search membership changed during pagination; retry collection");
      for (const repo of data.items) {
        if (partition.has(repo.id)) throw new GitHubError("Duplicate search row across pages; retry collection");
        partition.set(repo.id, repo.full_name);
      }
    }
    if (partition.size !== first.total_count) throw new GitHubError("GitHub search pagination was incomplete");
    for (const [id, name] of partition) found.set(id, name);
  }
  for (const topic of [...new Set(topics)]) await range(topic, start, end);
  return [...found.values()].sort((a, b) => a.localeCompare(b, "en"));
}

export async function readBlob(get, base, file, maxBytes = MAX_FILE_BYTES) {
  if (!/^\/repos\/[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(base)) throw new MetadataError("Invalid repository API base");
  if (file?.type !== "blob" || !/^100(644|755)$/.test(file.mode) || file.size > maxBytes || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(file.sha)) throw new MetadataError("Metadata must be a regular bounded Git blob");
  const blob = await get(`${base}/git/blobs/${file.sha}`, { immutable: true });
  if (blob.encoding !== "base64" || typeof blob.content !== "string" || blob.size > maxBytes || blob.content.length > Math.ceil(maxBytes * 1.5)) throw new MetadataError("Invalid or oversized metadata blob");
  const bytes = Buffer.from(blob.content, "base64");
  if (bytes.length > maxBytes) throw new MetadataError("Metadata exceeds the byte limit");
  return bytes.toString("utf8");
}

export async function repositoryTree(get, repository) {
  const base = repositoryPath(repository.full_name);
  if (!Number.isSafeInteger(repository.id) || typeof repository.default_branch !== "string" || !repository.default_branch) throw new GitHubError("Invalid repository metadata");
  let commit;
  try { commit = await get(`${base}/commits/${encodeURIComponent(repository.default_branch)}`); }
  catch (error) { if (error instanceof GitHubError && error.status === 409) return null; throw error; }
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(commit.sha) || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(commit.commit?.tree?.sha)) throw new GitHubError("Invalid repository commit");
  const tree = await get(`${base}/git/trees/${commit.commit.tree.sha}?recursive=1`, { immutable: true });
  if (tree.truncated !== false || !Array.isArray(tree.tree)) throw new GitHubError("Incomplete repository tree; refusing partial publication");
  return { commitSha: commit.sha, tree: tree.tree };
}
