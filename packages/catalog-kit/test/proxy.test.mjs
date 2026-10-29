import test from "node:test";
import assert from "node:assert/strict";
import { publicGitHubRequest } from "../src/public-github.mjs";
import { createRegistryGitHubClient } from "../src/proxy-client.mjs";

test("private blob/tree/ref parents are checked before any byte request; optional absence is null", async () => {
  const calls = [], get = async (endpoint) => { calls.push(endpoint); return { private: true }; };
  for (const suffix of [`/git/blobs/${"a".repeat(40)}`, `/git/trees/${"b".repeat(40)}?recursive=1`, "/commits/main", "/git/ref/tags/v1", "/tags?per_page=100&page=1"]) {
    await assert.rejects(publicGitHubRequest(get, `/repos/owner/private${suffix}`, {}, "plugins"), /not publicly/);
  }
  assert.ok(calls.every((endpoint) => endpoint === "/repos/owner/private"));
  assert.equal(await publicGitHubRequest(get, "/repos/owner/private", { optional: true }, "plugins"), null);
  assert.equal(await publicGitHubRequest(async () => null, "/repositories/42", { optional: true }, "plugins"), null);
});
test("proxy rejects private searches, OR injection, traversal, encoded traversal and unexpected queries", async () => {
  const get = () => { throw new Error("must not access API"); };
  for (const endpoint of ["/search/repositories?q=is:private", "/repos/o/r/../secrets", "/repos/o/r/actions/secrets", "/repos/o/r/contents", "/repos/o/r/commits/%2e%2e%2fsecret", "/repos/o/r/commits/main?private=true", "/repos/o/r/tags?page=1&page=2", "/repos/o/r/git/ref/tags/a%252fb", "/repositories/1?x=1", "//evil.test/"]) await assert.rejects(publicGitHubRequest(get, endpoint, {}, "plugins"), (error) => error.status === 400);
  const q = "topic:covel-plugin is:public fork:true created:2008-01-01T00:00:00Z..2026-01-01T00:00:00Z";
  const query = new URLSearchParams({ q, sort: "updated", order: "asc", page: "1", per_page: "100" });
  await assert.rejects(publicGitHubRequest(async () => ({ items: [{ private: true }] }), `/search/repositories?${query}`, {}, "plugins"), /not verified public/);
  await assert.rejects(publicGitHubRequest(get, `/search/repositories?${new URLSearchParams({ ...Object.fromEntries(query), q: `${q} OR is:private` })}`, {}, "plugins"), (error) => error.status === 400);
});
test("proxy allows supported public contracts and never treats live visibility as immutable", async () => {
  const calls = []; const get = async (endpoint, options) => { calls.push([endpoint, options]); return endpoint === "/repos/o/r" ? { id: 1, private: false } : { sha: "a".repeat(40) }; };
  await publicGitHubRequest(get, "/repos/o/r/commits/feature%2Fstory", { immutable: true }, "plugins");
  assert.deepEqual(calls[0], ["/repos/o/r", { optional: true }]);
  assert.equal(calls[1][0], "/repos/o/r/commits/feature%2Fstory");
});
test("proxy client does not forward credentials through redirects or accept insecure origins", async () => {
  assert.throws(() => createRegistryGitHubClient({ apiUrl: "http://example.test", token: "x", kind: "plugins" }));
  const get = createRegistryGitHubClient({ apiUrl: "https://catalog.test", token: "fixture-only", kind: "plugins", fetchImpl: async (url, options) => {
    assert.equal(url, "https://catalog.test/admin/github/plugins"); assert.equal(options.redirect, "error"); return new Response("null", { status: 200 });
  } });
  assert.equal(await get("/repos/o/r", { optional: true }), null);
});
