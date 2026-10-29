import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CatalogStore } from "../src/store.mjs";
import { entry, catalog, policy, time } from "./fixtures.mjs";

const base = Date.parse(time);
const stamp = (n) => new Date(base + n * 1000).toISOString();
const artifact = (n = "a", packagerVersion = "covel-zip-v1") => ({ artifactSha256: n.repeat(64), contentHash: "c".repeat(64), hashScheme: "covel-package-v1", packagerVersion, size: 100, filename: "demo.zip", storageKey: `${n.repeat(64)}.zip` });
function setup(t, filename = ":memory:") { let now = base; const store = new CatalogStore(filename, { now: () => now }); store.publishPolicy(policy()); t.after(() => store.close()); return { store, tick: (n = 1) => { now = base + n * 1000; } }; }

test("atomic snapshots isolate kinds and preserve prior publication on invalid/stale/empty inputs", (t) => {
  const { store, tick } = setup(t);
  const first = store.publish(catalog());
  assert.equal(store.publish(catalog()).snapshotId, first.snapshotId);
  assert.throws(() => store.publish(catalog([entry({ kind: "worlds" })])), /kind/);
  assert.throws(() => store.publish(catalog([], { generatedAt: stamp(1) })), /empty/);
  tick(); store.publish(catalog([entry({ kind: "worlds" })], { kind: "worlds", generatedAt: stamp(1), topics: ["covel-world"] }));
  assert.equal(store.snapshot("plugins").snapshotId, first.snapshotId);
  assert.throws(() => store.publish(catalog([entry({ stars: 1 })])), /newer/);
});

test("development revisions permit same declared version; unrelated commits only add observations", (t) => {
  const { store, tick } = setup(t);
  const first = store.publish(catalog()).entries[0];
  tick(); const same = store.publish(catalog([entry({ commitSha: "b".repeat(40) })], { generatedAt: stamp(1) })).entries[0];
  assert.equal(same.revisionId, first.revisionId);
  assert.equal(same.contentChangedAt, first.contentChangedAt);
  tick(2); const changed = store.publish(catalog([entry({ commitSha: "c".repeat(40), sourceTreeHash: "d".repeat(64) })], { generatedAt: stamp(2) })).entries[0];
  assert.notEqual(changed.revisionId, first.revisionId);
  assert.equal(changed.status, "indexed");
  assert.equal(store.versions(first.key).length, 2);
  assert.equal(store.db.prepare("SELECT count(*) AS n FROM observations").get().n, 3);
});

test("formal same-version changes and moved tags conflict without replacing original revision", (t) => {
  const { store, tick } = setup(t);
  const tag = entry({ sourceRef: { type: "tag", name: "demo/v1.0.0" } });
  const first = store.publish(catalog([tag])).entries[0];
  tick(); const next = store.publish(catalog([entry({ ...tag, sourceTreeHash: "c".repeat(64), commitSha: "d".repeat(40) })], { generatedAt: stamp(1) })).entries[0];
  assert.equal(next.status, "pending");
  assert.equal(store.snapshot("plugins").stats.pending, 1);
  assert.throws(() => store.revision(next.key, next.revisionId), /conflict/);
  assert.equal(store.revision(first.key, first.revisionId).commitSha, tag.commitSha);
  tick(2); store.publish(catalog([entry({ ...tag, commitSha: "e".repeat(40) })], { generatedAt: stamp(2) }));
  assert.equal(store.detail(tag.key).status, "pending");
  assert.equal(store.revision(first.key, first.revisionId).commitSha, tag.commitSha);
  assert.ok(store.versions(first.key).find((r) => r.revisionId === first.revisionId).observations.some((o) => o.conflict));
});

test("branch observations can change names without inventing a new content revision", (t) => {
  const { store, tick } = setup(t);
  const first = store.publish(catalog()).entries[0]; store.saveArtifact(first.revisionId, artifact());
  tick(); const e = store.publish(catalog([entry({ sourceRef: { type: "branch", name: "develop" }, commitSha: "c".repeat(40) })], { generatedAt: stamp(1) })).entries[0];
  assert.equal(e.revisionId, first.revisionId);
  const result = store.checkUpdate({ entryKey: e.key, revisionId: e.revisionId, hashScheme: "covel-package-v1", artifactSha256: artifact().artifactSha256, contentHash: artifact().contentHash, sourceRef: e.sourceRef, updatePolicy: "branch" }, { hostVersion: "0.0.51", contractsVerified: true });
  assert.equal(result.state, "current");
  assert.ok(store.versions(e.key)[0].observations.some((o) => o.sourceRef.name === "develop"));
  tick(2); store.publish(catalog([entry({ status: "archived" })], { generatedAt: stamp(2) }));
  assert.equal(store.checkUpdate({ entryKey: e.key }).reason, "archived");
});

test("service rejects malformed formal-release sidecars before changing a snapshot", (t) => {
  const { store } = setup(t);
  for (const invalid of [{ status: "pending" }, { version: "not-semver" }, { sourceTreeHash: null }, { ownerId: 999 }]) {
    assert.throws(() => store.publish(catalog(), { releases: [entry({ sourceRef: { type: "tag", name: "v1" }, ...invalid })] }), /valid indexed/);
    assert.equal(store.snapshot("plugins"), null);
  }
});

test("page order freezes metrics/data but policy changes invalidate old cursors", (t) => {
  const { store, tick } = setup(t);
  const entries = Array.from({ length: 52 }, (_, i) => entry({ repositoryId: i + 1, stars: i }));
  store.publish(catalog(entries));
  const first = store.list({ sort: "stars" });
  assert.equal(first.items.length, 24);
  tick(); store.publish(catalog(entries.map((e) => ({ ...e, stars: 100 - e.stars })), { generatedAt: stamp(1) }));
  const second = store.list({ sort: "stars", cursor: first.nextCursor });
  assert.equal(second.snapshotId, first.snapshotId);
  assert.equal(second.items[0].stars, 27);
  assert.equal(new Set([...first.items, ...second.items].map((e) => e.key)).size, 48);
  store.publishPolicy(policy([{ id: "blocked", repositoryId: 1, reason: "withdrawn", createdAt: time }], { sequence: 2, version: "test-2" }));
  assert.throws(() => store.list({ sort: "stars", cursor: first.nextCursor }), /policy changed/);
  assert.equal(store.list({}).total, 51);
});

test("tickets count once and every redemption checks fresh rules, including artifact-only blocks", (t) => {
  const { store } = setup(t);
  const e = store.publish(catalog()).entries[0], a = artifact();
  store.saveArtifact(e.revisionId, a);
  const ticket = store.issueTicket(e.key, e.revisionId, a, "request-00000000001");
  assert.equal(store.issueTicket(e.key, e.revisionId, a, "request-00000000001").token, ticket.token);
  store.redeem(ticket.token); store.redeem(ticket.token);
  assert.equal(store.detail(e.key).downloadRequests, 1);
  store.publishPolicy(policy([{ id: "bad-bytes", artifactSha256: a.artifactSha256, reason: "bad archive", createdAt: time }], { sequence: 2, version: "2" }));
  assert.throws(() => store.redeem(ticket.token), /bad archive/);
  store.publishPolicy(policy([], { sequence: 3, version: "3" }));
  assert.equal(store.redeem(ticket.token).artifact.artifactSha256, a.artifactSha256);
});

test("version-only revocation permits other revisions; repacking preserves old artifacts", (t) => {
  const { store, tick } = setup(t);
  const first = store.publish(catalog()).entries[0];
  store.saveArtifact(first.revisionId, artifact());
  store.saveArtifact(first.revisionId, artifact("b", "covel-zip-v2"));
  assert.throws(() => store.saveArtifact(first.revisionId, artifact("c")), /already exists/);
  tick(); const next = store.publish(catalog([entry({ commitSha: "e".repeat(40), sourceTreeHash: "f".repeat(64) })], { generatedAt: stamp(1) })).entries[0];
  store.publishPolicy(policy([{ id: "bad-new", repositoryId: 42, commitSha: next.commitSha, reason: "new regression", createdAt: time }], { sequence: 2, version: "2" }));
  assert.throws(() => store.revision(next.key, next.revisionId), /new regression/);
  assert.equal(store.revision(first.key, first.revisionId).commitSha, first.commitSha);
  assert.equal(store.versions(first.key).find((v) => v.revisionId === first.revisionId).artifacts.length, 2);
});

test("install lock requires verified artifacts/context; SemVer ignores build metadata", (t) => {
  const { store, tick } = setup(t);
  const first = store.publish(catalog([entry({ version: "1.0.0+one", sourceRef: { type: "tag", name: "v1" } })])).entries[0];
  store.saveArtifact(first.revisionId, artifact());
  const lock = { entryKey: first.key, revisionId: first.revisionId, hashScheme: "covel-package-v1", artifactSha256: artifact().artifactSha256, contentHash: artifact().contentHash, sourceRef: first.sourceRef, updatePolicy: "stable" };
  assert.equal(store.checkUpdate({ ...lock, contentHash: "e".repeat(64) }).reason, "unverified-source");
  assert.equal(store.checkUpdate(lock).state, "unknown");
  tick(); const next = store.publish(catalog([entry({ version: "1.0.0+two", commitSha: "d".repeat(40), sourceTreeHash: "e".repeat(64), sourceRef: { type: "tag", name: "v2" } })], { generatedAt: stamp(1) })).entries[0];
  store.saveArtifact(next.revisionId, artifact("b"));
  assert.equal(store.checkUpdate(lock, { hostVersion: "0.0.51", contractsVerified: true }).state, "current");
  assert.equal(store.checkUpdate(lock, { locallyModified: true }).state, "blocked");
});

test("database restart preserves ledger, counters, policy and cursor signatures", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "covel-store-"));
  try {
    const filename = path.join(dir, "catalog.sqlite");
    let store = new CatalogStore(filename, { now: () => base }); store.publishPolicy(policy());
    const e = store.publish(catalog()).entries[0], a = artifact(); store.saveArtifact(e.revisionId, a);
    const ticket = store.issueTicket(e.key, e.revisionId, a, "persistent-request-1");
    const cursor = store.signCursor({ expires: base + 1000, offset: 0 }); store.close();
    store = new CatalogStore(filename, { now: () => base });
    assert.equal(store.detail(e.key).downloadRequests, 1);
    assert.equal(store.redeem(ticket.token).revision.revisionId, e.revisionId);
    assert.equal(store.readCursor(cursor).offset, 0);
    assert.equal(store.policy().sequence, 1); store.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("10,000 entries keep query payload bounded to 24 summaries", (t) => {
  const { store } = setup(t);
  store.publish(catalog(Array.from({ length: 10_000 }, (_, i) => entry({ repositoryId: i + 1, name: `Package ${i}`, stars: i % 900 }))));
  const start = performance.now();
  const page = store.list({ sort: "stars" });
  assert.equal(page.total, 10_000); assert.equal(page.items.length, 24);
  assert.ok(Buffer.byteLength(JSON.stringify(page)) < 60_000);
  assert.ok(performance.now() - start < 2000, "First-page query exceeds the 2s regression budget");
});
