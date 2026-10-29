import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { collectLocal, collectRemote, loadInputs, root } from "./collect.mjs";
import { extractPlugins, parseYaml, validatePluginPackage } from "./metadata.mjs";
import { GitHubError, MetadataError } from "@covel/catalog-kit/github";
import { memoryCheckpoint } from "@covel/catalog-kit/round";

const inputs = await loadInputs(), config = { ...inputs.config, seedRepositories: [] };
const now = new Date("2026-10-29T00:00:00Z");
const repo = (id = 1) => ({ id, owner: { id: 4, login: "author" }, name: `plugins-${id}`, full_name: `author/plugins-${id}`, private: false, topics: ["covel-plugin"], default_branch: "main", stargazers_count: 12 });
const manifest = "---\nid: demo\nkind: plugin\nversion: 1.0.0\ncovel: '>=0.0.50'\nlicense: MIT\ndisplayName: Demo\nentry: ./server.js\n---\n# Demo";
const packageJson = JSON.stringify({ name: "demo", version: "1.0.0", type: "module" });
function source(extra = {}) {
  const files = { "PLUGIN.md": manifest, "package.json": packageJson, "server.js": "export default {}", "README.md": "# Demo", ...extra };
  const tree = Object.entries(files).map(([path, bytes]) => ({ path, type: "blob", mode: "100644", sha: createHash("sha1").update(bytes).digest("hex"), size: Buffer.byteLength(bytes) }));
  return { tree, read: async (file) => files[file.path] };
}
const extract = (files, options = {}) => extractPlugins({ repo: repo(), ...files, config, discovery: "topic", commitSha: "a".repeat(40), ...options });

test("local manifests generate eight real plugins without fabricated metrics or old compatibility", async () => {
  const catalog = await collectLocal(inputs);
  assert.equal(catalog.stats.packages, 8);
  assert.equal(catalog.stats.indexed, 8);
  for (const entry of catalog.entries) { assert.equal(entry.stars, null); assert.equal(entry.downloadRequests, null); assert.equal(entry.contentHash, null); assert.equal(entry.covelVersion, ">=0.0.50"); }
  const story = catalog.entries.find((e) => e.id === "story-note");
  assert.equal(story.version, "0.2.0"); assert.equal(story.legacyMetadata.covelVersion, "0.0.50");
});
test("every official package validates its ZIP layout including runtime handlers without executing code", async () => {
  const catalog = await collectLocal(inputs);
  for (const entry of catalog.entries) {
    const files = new Map();
    async function walk(relative = "") {
      for (const file of await readdir(path.join(root, entry.path, relative), { withFileTypes: true })) {
        const name = path.posix.join(relative, file.name);
        if (file.isDirectory()) await walk(name); else if (file.isFile()) files.set(name, { data: await readFile(path.join(root, entry.path, name)), mode: "100644" });
      }
    }
    await walk(); validatePluginPackage(files, entry);
  }
});
test("missing package.json and malformed siblings remain pending instead of disappearing", async () => {
  const files = source({ "bad/PLUGIN.md": "---\nid: [\n---", "nopkg/PLUGIN.md": manifest });
  const result = await extract(files);
  assert.equal(result.entries.length, 3); assert.equal(result.entries.filter((e) => e.status === "pending").length, 2);
  assert.equal(result.entries.find((e) => e.path === "").status, "indexed");
});
test("invalid versions preserve raw text; mismatches, host range and dependencies prevent indexing", async () => {
  for (const overrides of [{ "PLUGIN.md": manifest.replace("1.0.0", "tomorrow") }, { "package.json": packageJson.replace("1.0.0", "2.0.0") }, { "PLUGIN.md": manifest.replace(">=0.0.50", "unknown") }, { "package.json": JSON.stringify({ name: "demo", type: "module", version: "1.0.0", dependencies: { unsafe: "*" } }) }]) {
    const result = await extract(source(overrides)); assert.equal(result.entries[0].status, "pending"); assert.equal(result.entries[0].installUrl, null);
  }
  assert.equal((await extract(source({ "PLUGIN.md": manifest.replace("1.0.0", "tomorrow") }))).entries[0].version, "tomorrow");
});
test("fixed-SHA README and topic data cannot self-assign official identity", async () => {
  const e = (await extract(source({ "PLUGIN.md": manifest.replace("kind: plugin", "kind: plugin\nofficial: true") }))).entries[0];
  assert.equal(e.official, false); assert.ok(e.readmeUrl.includes("a".repeat(40))); assert.equal(e.stars, 12);
});
test("translation syntax errors are isolated while API failures abort collection", async () => {
  const files = source({ "locales/zh-CN.yaml": "bad: [" });
  const result = await extract(files); assert.equal(result.entries[0].status, "indexed"); assert.equal(result.issues.length, 1);
  await assert.rejects(extract({ ...files, read: async () => { throw new GitHubError("rate limit", 429); } }), GitHubError);
  for (const yaml of ["a: !run command", "a: &loop [*loop]", "a: 1\na: 2", "[1, 2]"]) assert.throws(() => parseYaml(yaml), MetadataError);
});
test("source fingerprints ignore unrelated monorepo commits and archives have no install URL", async () => {
  const files = source(); files.tree = files.tree.map((f) => ({ ...f, path: `demo/${f.path}` })); files.read = async (f) => source().read({ path: f.path.slice(5) });
  const a = (await extract(files)).entries[0];
  const b = (await extract({ ...files, tree: [...files.tree, { path: "other/README.md", mode: "100644", type: "blob", sha: "c".repeat(40) }] }, { commitSha: "d".repeat(40) })).entries[0];
  assert.equal(a.sourceTreeHash, b.sourceTreeHash);
  assert.equal((await extract(source(), { repo: { ...repo(), archived: true } })).entries[0].installUrl, null);
});
function getFixture(repos, override) {
  const files = source();
  return async (endpoint) => {
    if (override) { const result = await override(endpoint); if (result !== undefined) return result; }
    if (endpoint.startsWith("/search/")) return { total_count: repos.length, incomplete_results: false, items: repos };
    if (endpoint.includes("/commits/")) return { sha: "a".repeat(40), commit: { tree: { sha: "b".repeat(40) } } };
    if (endpoint.includes("/git/trees/")) return { truncated: false, tree: files.tree };
    if (endpoint.includes("/git/blobs/")) { const file = files.tree.find((f) => f.sha === endpoint.split("/").at(-1)); return { encoding: "base64", content: Buffer.from(await files.read(file)).toString("base64") }; }
    if (endpoint.includes("/tags?")) return [];
    return repos.find((repo) => `/repos/${repo.full_name}` === endpoint || `/repositories/${repo.id}` === endpoint) ?? null;
  };
}
test("remote topic OR, public status and topic removals are reconciled", async () => {
  const catalog = await collectRemote({ config, now, get: getFixture([repo(1), { ...repo(2), topics: [] }, { ...repo(3), private: true }]) });
  assert.equal(catalog.stats.repositories, 1); assert.equal(catalog.entries[0].repositoryId, 1);
});
test("budget failure preserves old publication and next run advances completed repository queue", async () => {
  const checkpoint = memoryCheckpoint(), repos = [repo(1), repo(2)]; let published = "old snapshot";
  const options = { config, now, checkpoint, onComplete: (result) => { published = result; } };
  await assert.rejects(collectRemote({ ...options, get: getFixture(repos, (endpoint) => { if (endpoint === "/repos/author/plugins-2") throw new GitHubError("budget", 429); }) }), /budget/);
  assert.equal(published, "old snapshot");
  await collectRemote({ ...options, get: getFixture(repos, (endpoint) => { if (endpoint === "/repos/author/plugins-1") throw new Error("Completed repository fetched twice"); }) });
  assert.equal(published.stats.repositories, 2);
});
test("resumed migration seeds are rechecked for privacy, transfer, rename and archival", async () => {
  for (const live of [null, { ...repo(1), private: true }, { ...repo(1), owner: { id: 99, login: "new-owner" } }, { ...repo(1), full_name: "author/renamed" }, { ...repo(1), archived: true }]) {
    const checkpoint = memoryCheckpoint(), repos = [repo(1), repo(2)];
    const options = { config: { ...config, seedRepositories: [repos[0].full_name] }, now, checkpoint };
    await assert.rejects(collectRemote({ ...options, get: getFixture(repos, (endpoint) => { if (endpoint === "/repos/author/plugins-2") throw new GitHubError("budget", 429); }) }), /budget/);
    const catalog = await collectRemote({ ...options, get: getFixture(repos, (endpoint) => {
      if (endpoint === "/repos/author/plugins-1") throw new Error("Completed seed should only need its numeric identity recheck");
      if (endpoint === "/repositories/1") return live;
    }) });
    assert.deepEqual(catalog.entries.map((entry) => entry.repositoryId), [2]);
  }
});
