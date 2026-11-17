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

test("malformed siblings remain pending instead of disappearing; package.json is optional", async () => {
  const files = source({ "bad/PLUGIN.md": "---\nid: [\n---", "nopkg/PLUGIN.md": manifest.replace("id: demo", "id: nopkg") });
  const result = await extract(files);
  assert.equal(result.entries.length, 3); assert.equal(result.entries.filter((e) => e.status === "pending").length, 1);
  assert.equal(result.entries.find((e) => e.path === "bad").status, "pending");
  assert.equal(result.entries.find((e) => e.path === "").status, "indexed");
  assert.equal(result.entries.find((e) => e.path === "nopkg").status, "indexed");
});
test("invalid versions preserve raw text; mismatches, host range and dependencies prevent indexing", async () => {
  for (const overrides of [{ "PLUGIN.md": manifest.replace("1.0.0", "tomorrow") }, { "package.json": JSON.stringify({ name: "demo", version: "1.0.0" }) }, { "PLUGIN.md": manifest.replace(">=0.0.50", "unknown") }, { "package.json": JSON.stringify({ name: "demo", type: "module", version: "1.0.0", dependencies: { unsafe: "*" } }) }]) {
    const result = await extract(source(overrides)); assert.equal(result.entries[0].status, "pending"); assert.equal(result.entries[0].installUrl, null);
  }
  assert.equal((await extract(source({ "PLUGIN.md": manifest.replace("1.0.0", "tomorrow") }))).entries[0].version, "tomorrow");
  // Covel reads the version from PLUGIN.md only; a package.json version or name does not matter.
  assert.equal((await extract(source({ "package.json": JSON.stringify({ version: "2.0.0", type: "module" }) }))).entries[0].status, "indexed");
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

// A package written to the current Covel contract (0.0.52+): no id, kind, entry,
// runtime type or default handler.
const current = "---\nversion: 1.0.0\ncovel: '>=0.0.52'\nlicense: MIT\ndisplayName: Current\n---\n# Current";
const fnRuntime = "---\ndescription: Saves a note.\nschedule:\n  trigger:\n    type: manual\nfunction:\n  timeoutMs: 5000\n---\n";
const agentRuntime = "---\ndescription: Writes a prompt.\nagent:\n  tools:\n    builtin: [submit-output]\n---\nWrite.";
function nested(dir, files) {
  const input = source();
  const all = Object.fromEntries(Object.entries(files).map(([name, text]) => [`${dir}/${name}`, text]));
  input.tree = Object.entries(all).map(([path, bytes]) => ({ path, type: "blob", mode: "100644", sha: createHash("sha1").update(bytes).digest("hex"), size: Buffer.byteLength(bytes) }));
  input.read = async (file) => all[file.path];
  return input;
}
const zip = (files) => new Map(Object.entries(files).map(([name, text]) => [name, { data: Buffer.from(text), mode: "100644" }]));
const currentFiles = {
  "PLUGIN.md": current, "package.json": JSON.stringify({ name: "@someone/current", type: "module" }), "server/index.js": "export default {}",
  "runtimes/save/RUNTIME.md": fnRuntime, "runtimes/save/handler.js": "export default () => ({})", "runtimes/prompt/RUNTIME.md": agentRuntime,
};

test("current-contract manifests derive id, kind, entry, runtime kind and handler", async () => {
  const entry = (await extract(nested("plugins/current-note", currentFiles))).entries[0];
  assert.equal(entry.status, "indexed"); assert.deepEqual(entry.problems, []);
  assert.equal(entry.id, "current-note"); assert.equal(entry.name, "Current");
  validatePluginPackage(zip(currentFiles), entry);
  // A root package takes the repository name.
  const rootEntry = (await extract(source({ "PLUGIN.md": current }))).entries[0];
  assert.equal(rootEntry.status, "indexed"); assert.equal(rootEntry.id, "plugins-1");
  validatePluginPackage(zip({ "PLUGIN.md": current, "package.json": packageJson, "server.js": "", "server/index.js": "export default {}" }), rootEntry);
});

test("derived defaults are checked: handler and entry files, invalid folder ids", async () => {
  const entry = (await extract(nested("plugins/current-note", currentFiles))).entries[0];
  const without = (name) => zip(Object.fromEntries(Object.entries(currentFiles).filter(([file]) => file !== name)));
  assert.throws(() => validatePluginPackage(without("runtimes/save/handler.js"), entry), /runtimes\/save\/handler\.js/);
  // A handler at the package root is not the default of a grouped runtime.
  assert.throws(() => validatePluginPackage(zip({ ...Object.fromEntries(Object.entries(currentFiles).filter(([file]) => file !== "runtimes/save/handler.js")), "handler.js": "" }), entry), MetadataError);
  // Without server/index.js and runtimes there is nothing to run.
  assert.throws(() => validatePluginPackage(zip({ "PLUGIN.md": current, "package.json": "{\"type\":\"module\"}" }), entry), /no entry or runtime/);
  // A folder that is no plugin ID falls back to the package.json name, then fails.
  const fallback = (await extract(nested("plugins/Current_Note", { "PLUGIN.md": current, "package.json": JSON.stringify({ name: "@someone/plugin-notes", type: "module" }) }))).entries[0];
  assert.equal(fallback.id, "notes"); assert.equal(fallback.status, "indexed");
  const invalid = await extract(nested("plugins/Current_Note", { "PLUGIN.md": current }));
  assert.equal(invalid.entries[0].status, "pending"); assert.deepEqual(invalid.entries[0].problems, ["invalid-manifest"]);
  assert.match(invalid.issues[0].message, /no valid plugin id/);
});

test("written id, kind and type follow Covel: mismatch pending, non-plugin kind rejected, type ignored", async () => {
  const mismatch = (await extract(nested("plugins/current-note", { ...currentFiles, "PLUGIN.md": current.replace("version:", "id: other-note\nversion:") }))).entries[0];
  assert.equal(mismatch.id, "other-note"); assert.equal(mismatch.status, "pending"); assert.deepEqual(mismatch.problems, ["directory-id-mismatch"]);
  for (const id of ["1note", "framework"]) assert.deepEqual((await extract(nested("plugins/x", { "PLUGIN.md": current.replace("version:", `id: ${id}\nversion:`) }))).entries[0].problems, ["invalid-manifest"]);
  const core = await extract(nested("plugins/current-note", { ...currentFiles, "PLUGIN.md": current.replace("version:", "kind: core\nversion:") }));
  assert.deepEqual(core.entries[0].problems, ["invalid-manifest"]);
  // Old manifests that still write id, kind, entry, type and handler stay valid.
  const legacyFiles = { ...currentFiles,
    "PLUGIN.md": current.replace("version:", "id: current-note\nkind: plugin\nentry: ./server/index.js\nversion:"),
    "runtimes/save/RUNTIME.md": fnRuntime.replace("function:\n", "type: function\nfunction:\n  handler: ./handler.js\n"),
    "runtimes/prompt/RUNTIME.md": agentRuntime.replace("agent:", "type: agent\nagent:"),
  };
  const legacy = (await extract(nested("plugins/current-note", legacyFiles))).entries[0];
  assert.equal(legacy.status, "indexed");
  validatePluginPackage(zip(legacyFiles), legacy);
  // A written type without a function block is an agent: it needs no handler.
  validatePluginPackage(zip({ ...currentFiles, "runtimes/prompt/RUNTIME.md": agentRuntime.replace("agent:", "type: function\nagent:") }), legacy);
  assert.throws(() => validatePluginPackage(zip({ ...currentFiles, "runtimes/save/RUNTIME.md": fnRuntime.replace("function:\n  timeoutMs: 5000", "function: []") }), legacy), /Invalid function runtime/);
});
