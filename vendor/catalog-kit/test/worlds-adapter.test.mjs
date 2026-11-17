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

// Covel 0.0.52+ worlds: no schemaVersion, no supportedLocales (editions come from
// files), and an id that defaults to the directory name.
const current = "name: Current\nsummary: A current-contract world\nversion: 1.0.0\ndefaultLocale: en-US\nplugins:\n  - pack:traditional-story\n  - plugin:dice-check\n";
test("current-contract worlds derive id and editions from their files", async () => {
  const { entries } = await extractWorlds(input({
    "demo/world.yaml": current, "demo/world.zh-CN.yaml": "name: 当前\nsummary: 当前契约\n", "demo/WORLD.ja.md": "# ja",
    "demo/WORLD.en.md": "# misnamed", "demo/data/world.fr-FR.yaml": "name: nested",
  }));
  const world = entries[0];
  assert.equal(world.status, "indexed"); assert.equal(world.id, "demo");
  assert.deepEqual(world.locales, ["en-US", "ja", "zh-CN"]);
  assert.deepEqual(world.translations["zh-CN"], { name: "当前", description: "当前契约" });
  assert.equal(world.pluginPreset, "traditional-story");
  // Legacy fields are ignored, not required; a written id still wins.
  const legacy = (await extractWorlds(input())).entries[0];
  assert.equal(legacy.status, "indexed"); assert.deepEqual(legacy.locales, ["en-US"]);
  const named = (await extractWorlds(input({ "demo/world.yaml": `id: other\n${current}` }))).entries[0];
  assert.equal(named.id, "other");
  const invalid = await extractWorlds(input({ "Bad_Dir/world.yaml": current, "Bad_Dir/WORLD.md": "#" }));
  assert.equal(invalid.entries.find(e => e.path === "Bad_Dir").status, "pending");
  assert.match(invalid.issues.find(i => i.path === "Bad_Dir").message, /no valid world id/);
});
