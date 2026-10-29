import { test } from "node:test";
import assert from "node:assert/strict";
import { publishCatalog, serviceUrl } from "../src/publish.mjs";
import { catalog, policy, time } from "./fixtures.mjs";

const args = { url: "https://catalog.example", token: "test-credential-not-a-real-secret", catalog: catalog(), now: new Date(time) };
const response = (data, status = 200) => new Response(JSON.stringify(data), { status });

test("publication validates policy, uses a scoped endpoint and disallows redirects", async () => {
  const calls = [];
  const result = await publishCatalog({ ...args, fetchImpl: async (url, init) => {
    calls.push([url, init]);
    if (url.endsWith("/v1/policy")) return response(policy());
    const payload = JSON.parse(init.body);
    assert.equal(payload.allowEmpty, false);
    assert.deepEqual(payload.releases, []);
    return response({ snapshotId: "a".repeat(64), stats: payload.catalog.stats });
  } });
  assert.equal(result.snapshotId, "a".repeat(64));
  assert.deepEqual(calls.map(([url]) => url), ["https://catalog.example/v1/policy", "https://catalog.example/admin/snapshots/plugins"]);
  assert.ok(calls.every(([, init]) => init.redirect === "error" && init.signal instanceof AbortSignal));
  assert.equal(calls[0][1].headers, undefined);
  assert.equal(calls[1][1].headers.authorization, `Bearer ${args.token}`);
});

test("unsafe API origins and expired policy stop before credentialed ingestion", async () => {
  for (const url of ["http://example.com", "https://user:pass@example.com", "https://example.com/?token=x", "https://example.com/#x", "https://example.com/path"]) assert.throws(() => serviceUrl(url));
  let requests = 0;
  await assert.rejects(publishCatalog({ ...args, fetchImpl: async () => { requests++; return response(policy([], { issuedAt: "2025-01-01T00:00:00Z", expiresAt: "2025-01-02T00:00:00Z" })); } }), /expired/);
  assert.equal(requests, 1);
});

test("local snapshots, failed preflight and failed ingestion never authorize Pages", async () => {
  await assert.rejects(publishCatalog({ ...args, catalog: catalog([], { mode: "local", generatedAt: null }), fetchImpl: async () => { throw new Error("must not fetch"); } }), /local preview/);
  await assert.rejects(publishCatalog({ ...args, fetchImpl: async () => response({}, 503) }), /preflight/);
  await assert.rejects(publishCatalog({ ...args, fetchImpl: async (url) => url.endsWith("/v1/policy") ? response(policy()) : response({}, 409) }), /Pages must not deploy/);
  await assert.rejects(publishCatalog({ ...args, fetchImpl: async (url) => url.endsWith("/v1/policy") ? response(policy()) : response({}) }), /receipt/);
});

test('publisher negotiates bounded staged ingestion without changing Node direct ingestion', async () => {
  const { catalog, policy } = await import('./fixtures.mjs');
  const { publishCatalog } = await import('../src/publish.mjs');
  const routes=[];const id='a'.repeat(64);
  const receipt=await publishCatalog({url:'https://api.covel.cc',token:'x'.repeat(32),catalog:catalog(),now:new Date('2026-10-29T12:00:00Z'),fetchImpl:async(url,init)=>{
    const path=new URL(url).pathname;routes.push(path);
    if(path==='/v1/policy')return Response.json(policy(),{headers:{'X-Catalog-Ingest':'staged-v1'}});
    if(path==='/admin/snapshots/plugins')return Response.json({snapshotId:id,next:0,published:false});
    if(path.endsWith('/records/0')){assert.equal(JSON.parse(init.body).type,'entry');return Response.json({next:1});}
    if(path.endsWith('/finish'))return Response.json({snapshotId:id,stats:catalog().stats});
    throw new Error(path);
  }});
  assert.equal(receipt.snapshotId,id);assert.equal(routes.length,4);
});
