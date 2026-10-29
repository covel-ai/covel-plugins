import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { extractWorlds, parseYaml } from "../adapters/worlds.mjs";
import { GitHubError } from "../src/github.mjs";
import { createCatalog } from "../src/schema.mjs";

const manifest = 'schemaVersion: "1.0"\nid: demo\nname: Demo\nsummary: A fixture world\nversion: 1.0.0\ndefaultLocale: en-US\nsupportedLocales: [en-US]\n';
function input(extra = {}) {
  const files = { "demo/world.yaml": manifest, "demo/WORLD.md": "# Lore", ...extra };
  const tree = Object.entries(files).map(([path, bytes]) => ({ path, type: "blob", mode: "100644", sha: createHash("sha1").update(`blob ${Buffer.byteLength(bytes)}\0${bytes}`).digest("hex") }));
  return { repo: { id: 42, owner: { id: 7, login: "author" }, name: "worlds", full_name: "author/worlds", default_branch: "main", private: false }, tree, read: async f => files[f.path], config: { officialRepositories: [], maxWorldsPerRepository: 100 }, discovery: "topic", commitSha: "a".repeat(40) };
}
test("shared worlds adapter preserves unknown compatibility and malformed siblings", async () => {
  const { entries, issues } = await extractWorlds(input({ "broken/world.yaml": "id: [" }));
  assert.equal(entries.length, 2);
  const valid = entries.find(e => e.path === "demo");
  assert.equal(valid.status, "indexed");
  assert.equal(valid.covelVersion, null);
  assert.equal(valid.contentHash, null);
  assert.equal(valid.official, false);
  assert.equal(entries.find(e => e.path === "broken").status, "pending");
  assert.equal(issues.length, 1);
  createCatalog({ kind: "worlds", entries, topics: ["covel-world", "covel-worlds"], issues });
});
test("worlds YAML errors stay distinct from operational errors", async () => {
  for (const yaml of ["a: &loop [*loop]", "a: 1\na: 2", "[1, 2]"]) assert.throws(() => parseYaml(yaml));
  await assert.rejects(extractWorlds({ ...input(), read: async () => { throw new GitHubError("API failure", 503); } }), GitHubError);
});
