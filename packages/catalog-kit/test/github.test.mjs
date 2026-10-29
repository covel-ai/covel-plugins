import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createGitHubClient, diskCache, memoryCache, discoverRepositories, GitHubError, MetadataError, readBlob, repositoryTree } from "../src/github.mjs";

const json = (body, options) => Response.json(body, options);
const repo = (id) => ({ id, full_name: `author/world-${id}` });
const search = (items, total = items.length, incomplete = false) => ({ items, total_count: total, incomplete_results: incomplete });
const fixedNow = new Date("2026-10-29T00:00:00Z");

test("topic union deduplicates repository IDs and uses real supported query fields", async () => {
  const calls = [];
  const names = await discoverRepositories(async (endpoint) => {
    const url = new URL(endpoint, "https://api.github.com");
    calls.push(url);
    assert.equal(url.pathname, "/search/repositories");
    assert.equal(url.searchParams.get("sort"), "updated");
    assert.equal(url.searchParams.get("per_page"), "100");
    assert.match(url.searchParams.get("q"), /is:public fork:true created:2008-01-01T00:00:00Z\.\.2026-10-29T00:00:00Z/);
    return url.searchParams.get("q").includes("topic:covel-world ") ? search([repo(1)]) : search([repo(1), repo(2)]);
  }, ["covel-world", "covel-worlds"], { now: fixedNow });
  assert.deepEqual(names, ["author/world-1", "author/world-2"]);
  assert.equal(calls.length, 2);
});

test("101 matches consume two full pages; duplicate or missing rows fail closed", async () => {
  const rows = Array.from({ length: 101 }, (_, i) => repo(i + 1));
  const request = async (endpoint) => search(endpoint.endsWith("page=1") ? rows.slice(0, 100) : rows.slice(100), rows.length);
  assert.equal((await discoverRepositories(request, ["covel-world"], { now: fixedNow })).length, 101);
  await assert.rejects(discoverRepositories(async (endpoint) => search(endpoint.endsWith("page=1") ? rows.slice(0, 100) : [rows[0]], rows.length), ["covel-world"], { now: fixedNow }), /Duplicate/);
  await assert.rejects(discoverRepositories(async () => search([], 1), ["covel-world"]), /incomplete/);
  await assert.rejects(discoverRepositories(async () => search([], 0, true), ["covel-world"]), /Incomplete/);
});

test("1000-result partitions cover both boundary seconds exactly once", async () => {
  const ranges = [];
  const names = await discoverRepositories(async (endpoint) => {
    const q = new URL(endpoint, "https://api.github.com").searchParams.get("q");
    const [start, end] = q.match(/created:(.+)\.\.(.+)$/).slice(1).map(Date.parse);
    ranges.push([start, end]);
    if (ranges.length === 1) return search([], 1001);
    return search([repo(ranges.length)]);
  }, ["covel-world"], { now: fixedNow });
  assert.equal(names.length, 2);
  assert.equal(ranges[1][0], ranges[0][0]);
  assert.equal(ranges[2][1], ranges[0][1]);
  assert.equal(ranges[1][1] + 1000, ranges[2][0]);
});

test("over 1000 repos at one timestamp never masquerade as a complete result", async () => {
  await assert.rejects(discoverRepositories(async () => search([], 1001), ["covel-world"], { now: new Date("2008-01-01T00:00:00Z") }), /within one second/);
});

test("changed total during pagination and malformed IDs are errors", async () => {
  const rows = Array.from({ length: 100 }, (_, i) => repo(i + 1));
  await assert.rejects(discoverRepositories(async (endpoint) => endpoint.endsWith("page=1") ? search(rows, 101) : search([repo(101)], 102), ["covel-world"]), /changed/);
  await assert.rejects(discoverRepositories(async () => search([{ id: null, full_name: "author/world" }]), ["covel-world"]), /Invalid repository/);
});

test("client serializes concurrent callers and caches conditional 304 responses", async () => {
  let active = 0;
  let calls = 0;
  const get = createGitHubClient({ token: "test-only", fetchImpl: async (_url, options) => {
    assert.equal(++active, 1);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    calls++;
    if (calls === 1) return json({ id: 1 }, { headers: { etag: '"one"' } });
    assert.equal(options.headers["If-None-Match"], '"one"');
    return new Response(null, { status: 304 });
  } });
  assert.deepEqual(await Promise.all([get("/repos/a/b"), get("/repos/a/b")]), [{ id: 1 }, { id: 1 }]);
});

test("304 without cached body retries without its validator", async () => {
  const cache = memoryCache();
  await cache.set("https://api.github.com/repos/a/b", { etag: '"lost"' });
  let calls = 0;
  const get = createGitHubClient({ cache, fetchImpl: async (_url, options) => {
    calls++;
    if (calls === 1) { assert.equal(options.headers["If-None-Match"], '"lost"'); return new Response(null, { status: 304 }); }
    assert.equal(options.headers["If-None-Match"], undefined);
    return json({ id: 12 });
  } });
  assert.deepEqual(await get("/repos/a/b"), { id: 12 });
  assert.equal(calls, 2);
});

test("disk cache checkpoints survive a fresh client; immutable blobs make no new call", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "covel-gh-cache-"));
  try {
    const get = createGitHubClient({ cache: diskCache(dir), fetchImpl: async () => json({ content: "value" }) });
    await get("/repos/a/b/git/blobs/abc", { immutable: true });
    const resumed = createGitHubClient({ cache: diskCache(dir), fetchImpl: async () => { throw new Error("must not fetch"); } });
    assert.deepEqual(await resumed("/repos/a/b/git/blobs/abc", { immutable: true }), { content: "value" });
    assert.equal(resumed.stats().requests, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("429/403 honor retry headers; long resets and budget exhaustion stop", async () => {
  for (const status of [429, 403]) {
    const delays = [];
    let calls = 0;
    const get = createGitHubClient({ sleep: async (ms) => delays.push(ms), fetchImpl: async () => ++calls === 1 ? new Response(null, { status, headers: { "retry-after": "2" } }) : json({ ok: true }) });
    assert.deepEqual(await get("/test"), { ok: true });
    assert.deepEqual(delays, [2000]);
  }
  const limited = createGitHubClient({ now: () => 100000, fetchImpl: async () => new Response(null, { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "3700" } }) });
  await assert.rejects(limited("/test"), (error) => error instanceof GitHubError && error.status === 403);
  const budget = createGitHubClient({ maxRequests: 0, fetchImpl: async () => { throw new Error("must not fetch"); } });
  await assert.rejects(budget("/test"), /budget exhausted/);
});

test("only explicit optional 404 is absence, never 401 or transient failures", async () => {
  const get = createGitHubClient({ fetchImpl: async (url) => new Response(null, { status: url.pathname.endsWith("missing") ? 404 : 401 }) });
  assert.equal(await get("/missing", { optional: true }), null);
  await assert.rejects(get("/missing"), (error) => error.status === 404);
  await assert.rejects(get("/private", { optional: true }), (error) => error.status === 401);
});

test("safe same-origin rename redirects work; cross-origin credentials never leave", async () => {
  const calls = [];
  const get = createGitHubClient({ token: "test-only", fetchImpl: async (url, options) => {
    calls.push(url.href);
    assert.equal(options.redirect, "manual");
    return url.pathname === "/repos/old/name" ? new Response(null, { status: 301, headers: { location: "/repositories/123" } }) : json({ id: 123, full_name: "new/name" });
  } });
  assert.equal((await get("/repos/old/name")).id, 123);
  assert.equal(calls.length, 2);
  let hostileCalls = 0;
  const hostile = createGitHubClient({ token: "test-only", fetchImpl: async () => { hostileCalls++; return new Response(null, { status: 302, headers: { location: "https://attacker.invalid/token" } }); } });
  await assert.rejects(hostile("/test"), /cross-origin/);
  assert.equal(hostileCalls, 1);
  await assert.rejects(hostile("/\\attacker.invalid/x"), /API path/);
});

test("oversized and invalid JSON responses are fatal API errors", async () => {
  const large = createGitHubClient({ maxResponseBytes: 10, fetchImpl: async () => json({ text: "a".repeat(100) }) });
  await assert.rejects(large("/test"), GitHubError);
  const invalid = createGitHubClient({ fetchImpl: async () => new Response("<html>down</html>") });
  await assert.rejects(invalid("/test"), GitHubError);
});

test("readBlob rejects symlinks/oversized data without fetching and preserves transient errors", async () => {
  const file = { type: "blob", mode: "100644", sha: "a".repeat(40), size: 10 };
  assert.equal(await readBlob(async () => ({ encoding: "base64", content: Buffer.from("hello").toString("base64"), size: 5 }), "/repos/a/b", file), "hello");
  await assert.rejects(readBlob(async () => { throw new Error("must not fetch"); }, "/repos/a/b", { ...file, mode: "120000" }), MetadataError);
  await assert.rejects(readBlob(async () => ({ encoding: "base64", content: "A".repeat(100) }), "/repos/a/b", file, 20), MetadataError);
  await assert.rejects(readBlob(async () => { throw new GitHubError("transient", 500); }, "/repos/a/b", file), (error) => error.status === 500);
});

test("repositoryTree pins a commit, returns empty repositories, rejects truncated trees", async () => {
  const metadata = { id: 1, full_name: "a/b", default_branch: "release/main" };
  const calls = [];
  const result = await repositoryTree(async (endpoint, options) => {
    calls.push([endpoint, options]);
    return endpoint.includes("/commits/") ? { sha: "a".repeat(40), commit: { tree: { sha: "b".repeat(40) } } } : { truncated: false, tree: [] };
  }, metadata);
  assert.equal(result.commitSha, "a".repeat(40));
  assert.match(calls[0][0], /release%2Fmain$/);
  assert.equal(calls[1][1].immutable, true);
  assert.equal(await repositoryTree(async () => { throw new GitHubError("empty", 409); }, metadata), null);
  await assert.rejects(repositoryTree(async (endpoint) => endpoint.includes("/commits/") ? { sha: "a".repeat(40), commit: { tree: { sha: "b".repeat(40) } } } : { truncated: true, tree: [] }, metadata), /Incomplete repository tree/);
});
