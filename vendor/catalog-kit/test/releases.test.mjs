import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { collectReleases, tagReleasesPackage } from "../src/releases.mjs";
import { memoryCheckpoint, fileCheckpoint } from "../src/round.mjs";
import { GitHubError, MetadataError } from "../src/github.mjs";

const now = new Date("2026-10-29T12:00:00.000Z");
const sha = (number) => number.toString(16).padStart(40, "0");
const repo = { id: 1, full_name: "owner/repo", owner: { id: 2 }, private: false };
const entry = (commitSha = sha(1), extras = {}) => ({ key: "github:1:worlds:package:world", kind: "worlds", path: "world", id: "lantern", repositoryId: 1,
  ownerId: 2, repository: "owner/repo", repositoryUrl: "https://github.com/owner/repo", commitSha, version: "1.0.0", sourceTreeHash: "c".repeat(64),
  status: "indexed", official: false, discovery: "topic", sourceRef: { type: "branch", name: "main" }, pinnedUrl: `https://github.com/owner/repo/tree/${commitSha}/world`,
  readmeUrl: `https://github.com/owner/repo/blob/${commitSha}/world/README.md`, ...extras });
const list = (names) => names.map((name) => ({ name, commit: { sha: sha(1) } }));
const opts = (get, extra = {}) => ({ get, repositories: [repo], entries: [entry()], now, extractAtCommit: async (_, commit) => [entry(commit)], ...extra });

test("only a positively named package release can enter stable history", async () => {
  assert.equal(tagReleasesPackage("v1.0.0", entry(sha(1), { path: "" }), 1), true);
  assert.equal(tagReleasesPackage("1.0.0", entry(sha(1), { path: "" }), 1), true);
  assert.equal(tagReleasesPackage("v1.0.0", entry(sha(1), { path: "" }), 2), false);
  assert.equal(tagReleasesPackage("v1.0.0", entry(), 1), false);
  assert.equal(tagReleasesPackage("world/v1.0.0", entry(), 2), true);
  assert.equal(tagReleasesPackage("lantern/v1.0.0", entry(), 2), true);
  const sibling = entry(sha(1), { key: "github:1:worlds:package:other", path: "other", id: "other", version: "9.0.0" });
  const get = async (url) => url.includes("/tags?") ? list(["lantern/v1.0.0"]) : { ref: "refs/tags/lantern/v1.0.0", object: { type: "commit", sha: sha(1) } };
  const result = await collectReleases(opts(get, { entries: [entry(), sibling], extractAtCommit: async () => [entry(), sibling] }));
  assert.deepEqual(result.releases.map((e) => e.key), [entry().key]);
  assert.match(result.issues[0].message, /not release evidence/);
});

test("lightweight and nested annotated refs resolve exact SHA; same commit is extracted once", async () => {
  const requests = [], extracted = [];
  const get = async (url, options) => {
    requests.push([url, options]);
    if (url.includes("/tags?")) return list(["lantern/v1.0.0", "world/v1.0.0"]);
    if (url.endsWith("/git/ref/tags/lantern/v1.0.0")) return { ref: "refs/tags/lantern/v1.0.0", object: { type: "commit", sha: sha(1) } };
    if (url.endsWith("/git/ref/tags/world/v1.0.0")) return { ref: "refs/tags/world/v1.0.0", object: { type: "tag", sha: sha(2) } };
    if (url.endsWith(`/git/tags/${sha(2)}`)) return { sha: sha(2), object: { type: "tag", sha: sha(3) } };
    if (url.endsWith(`/git/tags/${sha(3)}`)) return { sha: sha(3), object: { type: "commit", sha: sha(1) } };
    throw new Error(url);
  };
  const result = await collectReleases(opts(get, { extractAtCommit: async (_, commit, tag) => { extracted.push([commit, tag]); return [entry(commit)]; } }));
  assert.equal(extracted.length, 1);
  assert.deepEqual(result.releases.map((e) => e.sourceRef), [{ type: "tag", name: "lantern/v1.0.0" }, { type: "tag", name: "world/v1.0.0" }]);
  assert.ok(result.releases.every((e) => e.commitSha === sha(1) && e.releasePublishedAt === null && e.fetchedAt === now.toISOString()));
  assert.ok(requests.filter(([url]) => url.includes("/git/tags/")).every(([, options]) => options.immutable));
  assert.match(result.releases[0].readmeUrl, new RegExp(sha(1)));
});

test("100-item page boundaries and more refs than the budget resume on disk", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "covel-releases-"));
  try {
    const filename = path.join(directory, "checkpoint.json");
    const calls = [];
    let requestCount = 0;
    const get = async (url) => {
      if (++requestCount > 55) throw new GitHubError("budget exhausted", 429);
      calls.push(url);
      if (url.includes("/tags?")) {
        const page = Number(new URL(url, "https://api.github.com").searchParams.get("page"));
        return page === 1 ? list(Array.from({ length: 100 }, (_, n) => `v${n}`)) : [];
      }
      return { ref: `refs/tags/${url.split("/").at(-1)}`, object: { type: "commit", sha: sha(1) } };
    };
    let extractions = 0;
    const args = { extractAtCommit: async (_, commit) => { extractions++; return [entry(commit)]; } };
    await assert.rejects(collectReleases(opts(get, { ...args, checkpoint: fileCheckpoint(filename) })), /budget/);
    requestCount = 0;
    const result = await collectReleases(opts(get, { ...args, checkpoint: fileCheckpoint(filename) }));
    assert.equal(result.releases.length, 0);
    assert.equal(result.issues.length, 100);
    assert.equal(extractions, 1);
    assert.equal(new Set(calls).size, calls.length);
    assert.equal(calls.filter((url) => url.includes("/tags?")).length, 2);
    await collectReleases(opts(() => { throw new Error("must replay until publish acknowledged"); }, { checkpoint: fileCheckpoint(filename) }));
    await result.acknowledge();
    requestCount = 0;
    await assert.rejects(collectReleases(opts(get, { checkpoint: fileCheckpoint(filename) })), /budget/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("annotated peeling itself is resumable with a one-request budget", async () => {
  const checkpoint = memoryCheckpoint();
  const urls = [];
  let used = 0;
  const get = async (url) => {
    if (used++) throw new GitHubError("budget");
    urls.push(url);
    if (url.includes("/tags?")) return list(["world/v1.0.0"]);
    if (url.includes("/git/ref/")) return { ref: "refs/tags/world/v1.0.0", object: { type: "tag", sha: sha(2) } };
    return { sha: sha(2), object: { type: "commit", sha: sha(1) } };
  };
  await assert.rejects(collectReleases(opts(get, { checkpoint })), /budget/);
  used = 0;
  await assert.rejects(collectReleases(opts(get, { checkpoint })), /budget/);
  used = 0;
  const result = await collectReleases(opts(get, { checkpoint }));
  assert.equal(result.releases.length, 1);
  assert.equal(new Set(urls).size, 3);
});

test("bad metadata and removed/noncommit refs produce diagnostics, not release candidates", async () => {
  const get = async (url) => {
    if (url.includes("/tags?")) return list(["missing", "tree", "invalid", "world/v2.0.0-beta.1"]);
    const name = url.split("/").at(-1);
    if (name === "missing") return null;
    return { ref: `refs/tags/${url.split("/git/ref/tags/")[1]}`, object: { type: name === "tree" ? "tree" : "commit", sha: name === "v2.0.0-beta.1" ? sha(2) : sha(1) } };
  };
  const result = await collectReleases(opts(get, { extractAtCommit: async (_, commit) => {
    if (commit === sha(1)) return { entries: [entry(commit, { version: "no-semver" }), entry(commit, { key: "unknown" })], issues: [{ path: "broken", message: "Invalid YAML" }] };
    return [entry(commit, { version: "2.0.0-beta.1" })];
  } }));
  assert.equal(result.releases.length, 1);
  assert.equal(result.releases[0].version, "2.0.0-beta.1");
  assert.equal(result.issues.length, 4);
  assert.equal(result.releases[0].official, false);
});

test("network failures abort; metadata errors retain diagnostics and allow publication", async () => {
  const get = async (url) => url.includes("/tags?") ? list(["world/v1.0.0"]) : { ref: "refs/tags/world/v1.0.0", object: { type: "commit", sha: sha(1) } };
  await assert.rejects(collectReleases(opts(get, { extractAtCommit: async () => { throw new GitHubError("truncated tree"); } })), /truncated/);
  const result = await collectReleases(opts(get, { extractAtCommit: async () => { throw new MetadataError("invalid YAML"); } }));
  assert.equal(result.releases.length, 0);
  assert.match(result.issues[0].message, /invalid YAML/);
});

test("membership removal prunes resumed releases; next acknowledged round observes moved tags", async () => {
  const checkpoint = memoryCheckpoint();
  let commit = sha(1);
  const get = async (url) => url.includes("/tags?") ? list(["world/v1.0.0"]) : { ref: "refs/tags/world/v1.0.0", object: { type: "commit", sha: commit } };
  const first = await collectReleases(opts(get, { checkpoint }));
  assert.equal(first.releases[0].commitSha, sha(1));
  await first.acknowledge(); commit = sha(2);
  const moved = await collectReleases(opts(get, { checkpoint }));
  assert.equal(moved.releases[0].commitSha, sha(2));
  const removed = await collectReleases(opts(get, { checkpoint, entries: [], repositories: [] }));
  assert.deepEqual(removed.releases, []);
});

test("duplicate tag pages reset enumeration and never return a partial list", async () => {
  const checkpoint = memoryCheckpoint();
  const names = Array.from({ length: 100 }, (_, n) => `v${n}`);
  await assert.rejects(collectReleases(opts(async (url) => list(url.endsWith("page=1") ? names : ["v99"]), { checkpoint })), /membership changed/);
  const state = await checkpoint.load();
  assert.equal(state.repositories[1].nextPage, 1);
  assert.equal(state.repositories[1].tags.length, 0);
});

test("annotated cycles and mismatching adapter identities abort the sidecar", async () => {
  const get = async (url) => url.includes("/tags?") ? list(["world/v1.0.0"]) : url.includes("/git/ref/") ? { ref: "refs/tags/world/v1.0.0", object: { type: "tag", sha: sha(2) } } : { sha: sha(2), object: { type: "tag", sha: sha(2) } };
  await assert.rejects(collectReleases(opts(get)), /Cyclic/);
  const simple = async (url) => url.includes("/tags?") ? list(["world/v1.0.0"]) : { ref: "refs/tags/world/v1.0.0", object: { type: "commit", sha: sha(1) } };
  await assert.rejects(collectReleases(opts(simple, { extractAtCommit: async () => [entry(sha(9))] })), /another repository or commit/);
});
