import { packageKey } from "../src/hash.mjs";
import { createCatalog } from "../src/schema.mjs";
export const time = "2026-10-29T12:00:00.000Z";
export function entry(overrides = {}) {
  const result = {
    key: packageKey(42, "plugins", "plugins/demo"), kind: "plugins", id: "demo", name: "Demo", description: "A plugin for stories.",
    repositoryId: 42, ownerId: 7, repository: "author/plugins", repositoryUrl: "https://github.com/author/plugins", author: "author", path: "plugins/demo",
    sourceRef: { type: "branch", name: "main" }, commitSha: "a".repeat(40), sourceTreeHash: "b".repeat(64), contentHash: null, hashScheme: null,
    version: "1.0.0", covelVersion: ">=0.0.50", license: "MIT", category: "tools", tags: [], locales: ["en-US"], translations: {},
    official: false, discovery: "topic", fork: false, status: "indexed", problems: [], stars: 0, downloadRequests: null,
    releasePublishedAt: null, firstSeenAt: null, contentChangedAt: null, fetchedAt: time,
    installUrl: "https://github.com/author/plugins/tree/main/plugins/demo", pinnedUrl: `https://github.com/author/plugins/tree/${"a".repeat(40)}/plugins/demo`, readmeUrl: "https://github.com/author/plugins/blob/main/plugins/demo/README.md",
    ...overrides,
  };
  result.key = packageKey(result.repositoryId, result.kind, result.path);
  return result;
}
export const catalog = (entries = [entry()], options = {}) => createCatalog({ kind: "plugins", entries, topics: ["covel-plugin", "covel-plugins"], mode: "github", generatedAt: time, ...options });
export const policy = (rules = [], options = {}) => ({ schemaVersion: 1, sequence: 1, version: "test-1", issuedAt: time, expiresAt: "2026-11-05T12:00:00.000Z", rules, ...options });
