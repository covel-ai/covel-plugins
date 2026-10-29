import { test } from "node:test";
import assert from "node:assert/strict";
import { packageKey, fingerprintFiles, fingerprintTree } from "../src/hash.mjs";
import { createCatalog, parseCatalog, policySchema } from "../src/schema.mjs";
import { entry, catalog, policy, time } from "./fixtures.mjs";

test("repository candidates cannot collide with any legitimate package path", () => {
  const keys = [null, "", "@repository", "repository", "package:foo", "plugins/a b", "plugins/a%20b"].map((path) => packageKey(42, "plugins", path));
  assert.equal(new Set(keys).size, keys.length);
  for (const path of ["../a", "a/../b", "/a", "a\\b", "a//b", "a\0b"]) assert.throws(() => packageKey(42, "plugins", path));
  assert.notEqual(packageKey(42, "plugins", "a"), packageKey(42, "worlds", "a"));
});
test("content hash ignores input order, preserves bytes and executable mode", () => {
  const files = new Map([["b", Buffer.from("line\r\n")], ["a", Buffer.from("hello")]]);
  assert.equal(fingerprintFiles(files), fingerprintFiles(new Map([...files].reverse())));
  assert.notEqual(fingerprintFiles(files), fingerprintFiles(new Map([...files, ["b", Buffer.from("line\n")]])));
  assert.notEqual(fingerprintFiles(files), fingerprintFiles(new Map([...files, ["a", { data: Buffer.from("hello"), mode: "100755" }]])));
});
test("source fingerprint excludes unrelated packages and is not a byte digest", () => {
  const tree = [{ path: "plugins/a/package.json", type: "blob", mode: "100644", sha: "a".repeat(40) }];
  const digest = fingerprintTree(tree, "plugins/a");
  assert.equal(digest, fingerprintTree([...tree, { path: "plugins/b/file", type: "blob", mode: "100644", sha: "b".repeat(40) }], "plugins/a"));
  assert.notEqual(digest, fingerprintTree([{ ...tree[0], mode: "100755" }], "plugins/a"));
});
test("catalog validates identities, public links, counts and source provenance", () => {
  const good = catalog();
  assert.equal(parseCatalog(good).stats.packages, 1);
  assert.throws(() => parseCatalog({ ...good, stats: { ...good.stats, entries: 999 } }));
  assert.throws(() => catalog([entry({ repositoryUrl: "https://github.com.evil.test/a/b" })]));
  assert.throws(() => catalog([entry({ repositoryId: null })]));
  assert.throws(() => createCatalog({ kind: "worlds", entries: [entry()], topics: ["covel-world"] }));
  assert.throws(() => catalog([entry({ contentHash: "a".repeat(64) })]));
  assert.throws(() => catalog([entry(), entry()]));
  assert.equal(catalog([entry({ path: null, status: "pending" })]).stats.packages, 0);
});
test("policy requires scoped targets and an expiry", () => {
  policySchema.parse(policy([{ id: "blocked", repositoryId: 42, path: "plugins/demo", reason: "Withdrawn", createdAt: time }]));
  assert.throws(() => policySchema.parse(policy([{ id: "bad", path: "plugins/demo", reason: "bad", createdAt: time }])));
  assert.throws(() => policySchema.parse(policy([], { expiresAt: "2026-10-28T00:00:00.000Z" })));
});
