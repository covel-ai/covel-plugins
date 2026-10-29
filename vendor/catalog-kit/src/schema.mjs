import { z } from "zod";
import { packageKey, safePath } from "./hash.mjs";

const kind = z.enum(["plugins", "worlds"]);
const text = z.string().max(4000);
const date = z.iso.datetime().nullable();
const digest = z.string().regex(/^[a-f0-9]{64}$/).nullable();
const commit = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/).nullable();
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const repository = z.string().regex(/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/);
const githubUrl = z.url().max(2000).refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && url.hostname === "github.com" && !url.port && !url.username && !url.password;
});
const packagePath = z.string().refine((value) => value === "" || safePath(value)).nullable();
export const sourceRefSchema = z.object({ type: z.enum(["branch", "tag", "commit"]), name: z.string().min(1).max(255) }).strict();
export const issueSchema = z.object({ repository, path: packagePath, message: text }).strict();
export const entrySchema = z.object({
  key: z.string().min(1).max(700), kind, id: z.string().min(1).max(200),
  name: z.string().min(1).max(200), description: text,
  repositoryId: z.number().int().positive().nullable(), ownerId: z.number().int().positive().nullable(),
  repository, repositoryUrl: githubUrl, author: z.string().min(1).max(200), path: packagePath,
  sourceRef: sourceRefSchema.nullable(), commitSha: commit, sourceTreeHash: digest,
  contentHash: digest, hashScheme: z.literal("covel-package-v1").nullable(),
  version: z.string().max(100).nullable(), covelVersion: z.string().max(200).nullable(), pluginPreset: z.string().max(200).nullable().optional(),
  license: z.string().max(200).nullable(), category: z.string().min(1).max(80),
  tags: z.array(z.string().max(100)).max(50), locales: z.array(z.string().max(30)).max(30),
  translations: z.record(z.string().max(30), z.object({ name: z.string().max(200).optional(), description: text.optional(), notes: text.optional() }).strict()),
  official: z.boolean(), discovery: z.enum(["topic", "seed", "local"]), fork: z.boolean(),
  legacyMetadata: z.object({ covelVersion: z.string().max(200).nullable(), notes: text }).strict().optional(),
  status: z.enum(["indexed", "pending", "archived"]), problems: z.array(z.string().max(300)).max(100),
  stars: count.nullable(), downloadRequests: count.nullable(),
  releasePublishedAt: date, firstSeenAt: date, contentChangedAt: date, fetchedAt: date,
  installUrl: githubUrl.nullable(), pinnedUrl: githubUrl.nullable(), readmeUrl: githubUrl,
}).strict().superRefine((entry, ctx) => {
  if (entry.key !== packageKey(entry.repositoryId, entry.kind, entry.path)) ctx.addIssue({ code: "custom", message: "Entry key does not match repository/kind/path" });
  if (entry.repositoryUrl !== `https://github.com/${entry.repository}`) ctx.addIssue({ code: "custom", message: "Repository URL does not match identity" });
  if ((entry.contentHash === null) !== (entry.hashScheme === null)) ctx.addIssue({ code: "custom", message: "Content hash needs its scheme" });
});
const statsSchema = z.object({ repositories: count, entries: count, packages: count, indexed: count, pending: count, archived: count, issues: count }).strict();
const catalogSchema = z.object({
  schemaVersion: z.literal(1), kind, generatedAt: date, mode: z.enum(["github", "local"]),
  topics: z.array(z.string().regex(/^[a-z0-9][a-z0-9-]{0,49}$/)).min(1).max(10),
  stats: statsSchema, entries: z.array(entrySchema).max(100_000), issues: z.array(issueSchema).max(100_000),
}).strict();

export function catalogStats(entries, issues) {
  return {
    repositories: new Set(entries.map((entry) => entry.repositoryId ?? entry.repository)).size,
    entries: entries.length, packages: entries.filter((entry) => entry.path !== null).length,
    indexed: entries.filter((entry) => entry.status === "indexed").length,
    pending: entries.filter((entry) => entry.status === "pending").length,
    archived: entries.filter((entry) => entry.status === "archived").length, issues: issues.length,
  };
}

export function parseCatalog(input) {
  const result = catalogSchema.parse(input);
  const keys = new Set();
  for (const entry of result.entries) {
    if (entry.kind !== result.kind || keys.has(entry.key)) throw new Error("Duplicate entry or mismatched kind");
    if (result.mode === "github" && (entry.repositoryId === null || entry.discovery === "local" || !result.generatedAt)) throw new Error("Remote catalog contains local identities");
    keys.add(entry.key);
  }
  const stats = catalogStats(result.entries, result.issues);
  if (Object.keys(stats).some((key) => result.stats[key] !== stats[key])) throw new Error("Catalog statistics do not match its entries");
  return result;
}

export function createCatalog({ kind, entries, topics, generatedAt = null, mode = "local", issues = [] }) {
  return parseCatalog({ schemaVersion: 1, kind, generatedAt, mode, topics, stats: catalogStats(entries, issues), entries: [...entries].sort((a, b) => a.key.localeCompare(b.key, "en")), issues });
}

export const policySchema = z.object({
  schemaVersion: z.literal(1), sequence: z.number().int().positive(), version: z.string().min(1).max(100),
  issuedAt: z.iso.datetime(), expiresAt: z.iso.datetime(),
  rules: z.array(z.object({
    id: z.string().min(1).max(100), reason: z.string().min(1).max(2000), createdAt: z.iso.datetime(),
    kind: kind.optional(), repositoryId: z.number().int().positive().optional(), ownerId: z.number().int().positive().optional(),
    path: z.string().refine((p) => p === "" || safePath(p)).optional(),
    commitSha: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/).optional(),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    artifactSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  }).strict().refine((rule) => (rule.repositoryId || rule.ownerId || rule.contentHash || rule.artifactSha256) && (rule.path === undefined || rule.repositoryId) && (!rule.commitSha || rule.repositoryId), "Rule needs a specific identity; path/commit need repositoryId")).max(100_000),
}).strict().refine((policy) => Date.parse(policy.expiresAt) > Date.parse(policy.issuedAt), "Policy expiry must follow issuance");
