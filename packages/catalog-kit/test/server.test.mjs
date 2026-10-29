import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createCatalogServer, CatalogStore } from "../src/server.mjs";
import { sha256 } from "../src/hash.mjs";
import { entry, catalog, policy, time } from "./fixtures.mjs";

async function fixture(t, options = {}) {
  const cacheDir = await mkdtemp(path.join(tmpdir(), "covel-http-"));
  const store = new CatalogStore(":memory:", { now: () => Date.parse(time) });
  store.publishPolicy(policy()); const e = store.publish(catalog()).entries[0];
  const bytes = Buffer.from("a fixture archive payload"), digest = sha256(bytes);
  const artifact = { artifactSha256: digest, contentHash: "c".repeat(64), hashScheme: "covel-package-v1", packagerVersion: "covel-zip-v1", size: bytes.length, filename: "demo.zip", storageKey: `${digest}.zip` };
  await writeFile(path.join(cacheDir, artifact.storageKey), bytes);
  const server = createCatalogServer({ store, cacheDir, publicUrl: "http://127.0.0.1", packager: { prepare: async () => { if (options.duringPrepare) options.duringPrepare(store); return artifact; } }, get: async () => ({ id: 42, private: false, owner: { id: 7 } }), ...options });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const post = (route, data, headers = {}) => fetch(`${url}${route}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(data) });
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); store.close(); await rm(cacheDir, { recursive: true, force: true }); });
  return { store, e, artifact, bytes, url, post };
}

test("HTTP prepare, ticket retry, GET/HEAD/Range and post-issuance ban share one policy gate", async (t) => {
  const { e, store, post, url, bytes } = await fixture(t);
  const input = { key: e.key, revisionId: e.revisionId, idempotencyKey: "http-request-00000001" };
  const response = await post("/v1/downloads", input); assert.equal(response.status, 200);
  const result = await response.json(); assert.equal(result.artifact.storageKey, undefined);
  const again = await (await post("/v1/downloads", input)).json(); assert.equal(again.url, result.url);
  const route = new URL(result.url).pathname;
  const downloaded = await fetch(url + route); assert.equal(downloaded.status, 200); assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), bytes);
  const range = await fetch(url + route, { headers: { range: "bytes=2-5" } }); assert.equal(range.status, 206); assert.equal(await range.text(), bytes.subarray(2, 6).toString());
  assert.equal((await fetch(url + route, { method: "HEAD" })).status, 200);
  assert.equal((await fetch(url + route, { headers: { range: "bytes=999-" } })).status, 416);
  assert.equal(store.detail(e.key).downloadRequests, 1);
  store.publishPolicy(policy([{ id: "revoke", repositoryId: 42, reason: "Removed", createdAt: time }], { sequence: 2, version: "2" }));
  assert.equal((await fetch(url + route)).status, 410);
  assert.equal((await post("/v1/downloads", { ...input, idempotencyKey: "http-request-00000002" })).status, 410);
});

test("policy changed during packaging prevents ticket and counter creation", async (t) => {
  const { e, post, store } = await fixture(t, { duringPrepare: (store) => store.publishPolicy(policy([{ id: "revoke", repositoryId: 42, reason: "Removed", createdAt: time }], { sequence: 2, version: "2" })) });
  assert.equal((await post("/v1/downloads", { key: e.key, revisionId: e.revisionId, idempotencyKey: "http-request-00000001" })).status, 410);
  assert.equal(store.detail(e.key).downloadRequests, 0);
});

test("idempotent retry after packager upgrade returns the exact old ticket artifact", async (t) => {
  const fixtureData = await fixture(t);
  const { e, store, post, artifact } = fixtureData;
  const input = { key: e.key, revisionId: e.revisionId, idempotencyKey: "upgrade-request-00001" };
  const first = await (await post("/v1/downloads", input)).json();
  const previousSha = artifact.artifactSha256;
  artifact.packagerVersion = "covel-zip-v2"; artifact.artifactSha256 = "f".repeat(64);
  const retry = await (await post("/v1/downloads", input)).json();
  assert.equal(retry.url, first.url); assert.equal(retry.artifact.artifactSha256, previousSha);
  assert.equal(retry.artifact.packagerVersion, "covel-zip-v1");
  store.publishPolicy(policy([{ id: "old-archive", artifactSha256: previousSha, reason: "Old archive withdrawn", createdAt: time }], { sequence: 2, version: "2" }));
  assert.equal((await post("/v1/downloads", input)).status, 410);
  assert.equal(store.detail(e.key).downloadRequests, 1);
});

test("scoped ingestion, strict body validation, CORS and policy expiry fail closed", async (t) => {
  const { post, url, store } = await fixture(t, { tokens: { plugins: "fixture-plugins-token-for-tests-only" } });
  assert.equal((await post("/admin/snapshots/plugins", { catalog: catalog() })).status, 401);
  assert.equal((await post("/admin/snapshots/worlds", { catalog: catalog() }, { authorization: "Bearer fixture-plugins-token-for-tests-only" })).status, 401);
  assert.equal((await post("/v1/downloads", { key: "../../etc/passwd" })).status, 400);
  assert.equal((await fetch(url + "/v1/catalog", { headers: { origin: "https://wrong.example" } })).status, 403);
  store.now = () => Date.parse("2027-01-01T00:00:00Z");
  assert.equal((await fetch(url + "/v1/catalog")).status, 503);
});
