import http from "node:http";
import path from "node:path";
import { readFile, lstat } from "node:fs/promises";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { CatalogStore, ServiceError, fail } from "./store.mjs";
import { sha256 } from "./hash.mjs";
import { publicGitHubRequest } from "./public-github.mjs";

const downloadSchema = z.object({ key: z.string().min(1).max(700), revisionId: z.string().regex(/^[a-f0-9]{64}$/), idempotencyKey: z.string().min(16).max(200) }).strict();
const lockSchema = z.object({
  registryUrl: z.url(), entryKey: z.string().max(700), revisionId: z.string().regex(/^[a-f0-9]{64}$/), installedVersion: z.string().max(100).nullable(),
  commitSha: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/), contentHash: z.string().regex(/^[a-f0-9]{64}$/), hashScheme: z.string().max(100),
  artifactSha256: z.string().regex(/^[a-f0-9]{64}$/), sourceRef: z.object({ type: z.enum(["branch", "tag", "commit"]), name: z.string().max(255) }).strict(),
  updatePolicy: z.enum(["pinned", "branch", "stable"]), installedAt: z.iso.datetime(), lastCheckedAt: z.iso.datetime().nullable(), previousRevisionId: z.string().nullable(),
}).strict();
const updateSchema = z.object({ lock: lockSchema, hostVersion: z.string().max(100).optional(), locallyModified: z.boolean().optional(), contractsVerified: z.boolean().optional() }).strict();
const equalSecret = (actual, expected) => {
  if (typeof expected !== "string" || expected.length < 24 || typeof actual !== "string") return false;
  const a = Buffer.from(actual), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};
async function body(request, limit) {
  if (!/^application\/json(?:;|$)/i.test(request.headers["content-type"] ?? "")) fail(415, "content_type", "Expected application/json");
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) fail(413, "body_limit", "Request exceeds the payload limit");
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { fail(400, "invalid_json", "Invalid JSON request body"); }
}
function rangeOf(range, size) {
  if (!range) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) fail(416, "invalid_range", "Only one byte range is supported");
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] ? (match[2] ? Math.min(Number(match[2]), size - 1) : size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= size) fail(416, "invalid_range", "Range is outside the artifact");
  return { start, end };
}

/** One service serves both directories. Tokens and GitHub credentials never reach
 * Pages. Callers supply adapters and storage; this module creates no resources. */
export function createCatalogServer({ store, packager, get, cacheDir, publicUrl, allowedOrigins = [], tokens = {}, maxBodyBytes = 64 * 1024 * 1024, rateLimit = 180, now = () => Date.now() }) {
  const baseUrl = new URL(publicUrl);
  if (baseUrl.protocol !== "https:" && !(baseUrl.protocol === "http:" && ["localhost", "127.0.0.1"].includes(baseUrl.hostname))) throw new Error("Public service URL must use HTTPS");
  const canonicalUrl = baseUrl.href.replace(/\/$/, "");
  const buckets = new Map();
  let activeDownloads = 0;
  function authorize(request, token) {
    if (!equalSecret(request.headers.authorization, token ? `Bearer ${token}` : undefined)) fail(401, "unauthorized", "Valid scoped service credentials are required");
  }
  async function liveRepository(entry) {
    const repo = await get(`/repositories/${entry.repositoryId}`, { optional: true });
    if (!repo || repo.private !== false || repo.disabled || repo.archived || repo.id !== entry.repositoryId || repo.owner?.id !== entry.ownerId) fail(410, "repository_unavailable", "Repository is no longer publicly distributable under its indexed owner");
    store.assertAllowed(entry);
  }
  const server = http.createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    const origin = request.headers.origin;
    if (origin && allowedOrigins.includes(origin)) { response.setHeader("Access-Control-Allow-Origin", origin); response.setHeader("Vary", "Origin"); }
    function send(status, value) { response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }); response.end(JSON.stringify(value)); }
    try {
      if (origin && !allowedOrigins.includes(origin)) fail(403, "origin_denied", "This origin is not configured for the directory");
      if (request.method === "OPTIONS") { response.writeHead(204, { "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type,Authorization,Range", "Access-Control-Max-Age": "300" }); response.end(); return; }
      const ip = request.socket.remoteAddress;
      const bucket = buckets.get(ip) ?? { time: now(), count: 0 };
      if (now() - bucket.time >= 60_000) { bucket.time = now(); bucket.count = 0; }
      if (++bucket.count > rateLimit) { response.setHeader("Retry-After", "60"); fail(429, "request_limit", "Too many requests; retry in a minute"); }
      buckets.set(ip, bucket);
      if (buckets.size > 10_000) for (const [key, b] of buckets) if (now() - b.time >= 60_000) buckets.delete(key);
      const url = new URL(request.url, canonicalUrl);
      const route = url.pathname;
      const method = request.method;
      if (method === "GET" && route === "/healthz") { send(200, { status: "ok", schemaVersion: 1 }); return; }
      if (method === "GET" && route === "/v1/catalog") { send(200, store.list(Object.fromEntries(url.searchParams))); return; }
      if (method === "GET" && route === "/v1/policy") { send(200, store.policy()); return; }
      const entryMatch = /^\/v1\/entries\/([^/]+)(\/versions)?$/.exec(route);
      if (method === "GET" && entryMatch) {
        const key = decodeURIComponent(entryMatch[1]);
        send(200, entryMatch[2] ? store.versions(key) : store.detail(key)); return;
      }
      if (method === "POST" && route === "/v1/check-update") {
        const input = updateSchema.parse(await body(request, 16_384));
        if (input.lock.registryUrl.replace(/\/$/, "") !== canonicalUrl) { send(200, { state: "unknown", reason: "registry-mismatch" }); return; }
        send(200, store.checkUpdate(input.lock, input)); return;
      }
      if (method === "POST" && route === "/admin/policy") {
        authorize(request, tokens.policy);
        send(200, store.publishPolicy(await body(request, maxBodyBytes))); return;
      }
      if (method === "POST" && route.startsWith("/admin/github/")) {
        const kind = route.slice("/admin/github/".length);
        if (!["plugins", "worlds"].includes(kind)) fail(404, "not_found", "Unknown directory kind");
        authorize(request, tokens[kind]);
        const input = z.object({ endpoint: z.string().max(3000), options: z.object({ optional: z.boolean().optional(), immutable: z.boolean().optional() }).strict().default({}) }).strict().parse(await body(request, 4096));
        const value = await publicGitHubRequest(get, input.endpoint, input.options, kind);
        send(200, value); return;
      }
      if (method === "POST" && route.startsWith("/admin/snapshots/")) {
        const kind = route.slice("/admin/snapshots/".length);
        if (!["plugins", "worlds"].includes(kind)) fail(404, "not_found", "Unknown directory kind");
        authorize(request, tokens[kind]);
        const input = await body(request, maxBodyBytes);
        if (input.catalog?.kind !== kind) fail(400, "kind_mismatch", "Snapshot kind must match its scoped endpoint");
        const snapshot = store.publish(input.catalog, { releases: input.releases ?? [], allowEmpty: input.allowEmpty === true });
        send(200, { snapshotId: snapshot.snapshotId, stats: snapshot.stats }); return;
      }
      if (method === "POST" && route === "/v1/downloads") {
        if (activeDownloads >= 4) fail(503, "download_busy", "Download preparation is busy; retry shortly");
        activeDownloads++;
        try {
          const input = downloadSchema.parse(await body(request, 4096));
          const revision = store.revision(input.key, input.revisionId);
          const artifact = await packager.prepare(revision.entry);
          // A new policy may have been published while GitHub/ZIP work ran.
          store.assertAllowed(store.revision(input.key, input.revisionId).entry, artifact);
          store.saveArtifact(input.revisionId, artifact);
          const ticket = store.issueTicket(input.key, input.revisionId, artifact, input.idempotencyKey);
          const { storageKey, ...publicArtifact } = store.redeem(ticket.token).artifact;
          send(200, { url: `${canonicalUrl}/v1/files/${ticket.token}`, expiresAt: new Date(ticket.expires).toISOString(), artifact: publicArtifact }); return;
        } finally { activeDownloads--; }
      }
      const fileMatch = /^\/v1\/files\/([A-Za-z0-9_-]{43})$/.exec(route);
      if (["GET", "HEAD"].includes(method) && fileMatch) {
        if (activeDownloads >= 4) fail(503, "download_busy", "Download service is busy; retry shortly");
        activeDownloads++;
        try {
          const current = store.redeem(fileMatch[1]);
          await liveRepository(current.revision.entry);
          const { artifact } = current;
          if (!/^[a-f0-9]{64}\.zip$/.test(artifact.storageKey)) fail(500, "invalid_storage", "Invalid artifact storage record");
          const filename = path.join(cacheDir, artifact.storageKey);
          const stat = await lstat(filename);
          if (!stat.isFile() || stat.size !== artifact.size || stat.size > 20 * 1024 * 1024) fail(503, "artifact_corrupt", "Artifact cache must be restored");
          const bytes = await readFile(filename);
          if (sha256(bytes) !== artifact.artifactSha256) fail(503, "artifact_corrupt", "Artifact cache must be restored");
          store.redeem(fileMatch[1]); // final policy/ticket gate immediately before bytes
          const range = rangeOf(request.headers.range, bytes.length);
          const selected = range ? bytes.subarray(range.start, range.end + 1) : bytes;
          response.writeHead(range ? 206 : 200, { "Content-Type": "application/zip", "Content-Length": selected.length,
            "Content-Disposition": `attachment; filename="${artifact.filename.replace(/[^A-Za-z0-9._-]/g, "-")}"`, "Accept-Ranges": "bytes",
            ...(range ? { "Content-Range": `bytes ${range.start}-${range.end}/${bytes.length}` } : {}) });
          response.end(method === "HEAD" ? undefined : selected); return;
        } finally { activeDownloads--; }
      }
      fail(404, "not_found", "Unknown directory endpoint");
    } catch (error) {
      if (response.headersSent) { response.destroy(); return; }
      const status = error instanceof ServiceError ? error.status : error instanceof z.ZodError || error instanceof URIError ? 400 : error.name === "MetadataError" ? 422 : error.name === "GitHubError" ? 503 : 500;
      // Do not return stack traces, SQL, tokens or private cache paths.
      send(status, { code: error.code && typeof error.code === "string" && error instanceof ServiceError ? error.code : status === 400 ? "invalid_input" : "request_failed",
        message: error instanceof ServiceError || error.name === "MetadataError" ? error.message : status === 400 ? "Request does not match the directory contract" : "The directory could not complete this request" });
    }
  });
  server.requestTimeout = 60_000;
  server.headersTimeout = 15_000;
  server.keepAliveTimeout = 5_000;
  return server;
}

export { CatalogStore };
