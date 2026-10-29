import test from 'node:test';
import assert from 'node:assert/strict';
import { requestDownload } from '../src/download-client.mjs';
test('pending download reuses its idempotency key and only returns a ready same-origin ticket', async () => {
  const bodies = []; let waits = 0;
  const result = await requestDownload({ api: 'https://api.covel.cc', key: 'key', revisionId: 'r', idempotencyKey: 'same', wait: async () => waits++, fetchImpl: async (_, init) => {
    bodies.push(init.body); return Response.json(bodies.length < 3 ? { state: 'pending', jobId: 'job' } : { url: 'https://api.covel.cc/v1/files/ticket', artifact: { artifactSha256: 'hash' } }, { status: bodies.length < 3 ? 202 : 200 });
  } });
  assert.equal(waits, 2); assert.equal(new Set(bodies).size, 1); assert.match(result.url, /ticket$/);
});
test('failed preparation and foreign ticket origins fail without silently downloading', async () => {
  for (const response of [Response.json({ message: 'withdrawn' }, { status: 410 }), Response.json({ url: 'https://evil.test/v1/files/ticket', artifact: { artifactSha256: 'h' } })]) {
    await assert.rejects(requestDownload({ api: 'https://api.covel.cc', fetchImpl: async () => response }));
  }
});
test('leaving a pending detail cancels polling without issuing a ticket', async () => {
  const controller = new AbortController(); let requests = 0;
  await assert.rejects(requestDownload({ api:'https://api.covel.cc',signal:controller.signal,fetchImpl:async()=>{
    requests++;controller.abort();return Response.json({state:'pending',jobId:'job'},{status:202});
  }}),{name:'AbortError'});
  assert.equal(requests,1);
});
