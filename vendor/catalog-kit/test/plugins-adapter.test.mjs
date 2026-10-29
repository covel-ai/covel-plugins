import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { extractPlugins, parseYaml, validatePluginPackage } from "../adapters/plugins.mjs";
import { GitHubError, MetadataError } from "../src/github.mjs";
const config = { officialRepositories: [], maxPluginsPerRepository: 100, overrides: {} };
const repo = (id = 1) => ({ id, owner: { id: 4, login: "author" }, name: `plugins-${id}`, full_name: `author/plugins-${id}`, private: false, topics: ["covel-plugin"], default_branch: "main", stargazers_count: 12 });
const manifest = "---\nid: demo\nkind: plugin\nversion: 1.0.0\ncovel: '>=0.0.50'\nlicense: MIT\ndisplayName: Demo\nentry: ./server.js\n---\n# Demo";
const packageJson = JSON.stringify({ name: "demo", version: "1.0.0", type: "module" });
function source(extra = {}) {
  const files = { "PLUGIN.md": manifest, "package.json": packageJson, "server.js": "export default {}", "README.md": "# Demo", ...extra };
  const tree = Object.entries(files).map(([path, bytes]) => ({ path, type: "blob", mode: "100644", sha: createHash("sha1").update(bytes).digest("hex"), size: Buffer.byteLength(bytes) }));
  return { tree, read: async (file) => files[file.path] };
}
const extract = (files, options = {}) => extractPlugins({ repo: repo(), ...files, config, discovery: "topic", commitSha: "a".repeat(40), ...options });

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

test("shared plugin validator checks the exact selected files without execution", async () => {
  const input = source();
  const entry = (await extract(input)).entries[0];
  const files = new Map(await Promise.all(input.tree.map(async f => [f.path, { data: Buffer.from(await input.read(f)), mode: f.mode }])));
  validatePluginPackage(files, entry);
  files.delete("server.js");
  assert.throws(() => validatePluginPackage(files, entry));
});
