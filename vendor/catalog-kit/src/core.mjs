import semver from "semver";
import { sha256 } from "./hash.mjs";
import { entrySchema, policySchema } from "./schema.mjs";

export class ServiceError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export const fail = (status, code, message) => { throw new ServiceError(status, code, message); };
export const identity = (entry) => entry.sourceTreeHash ?? entry.contentHash;


export function ruleFor(entry, artifact, policy) {
    return policy.rules.find((rule) =>
      (!rule.kind || rule.kind === entry.kind) &&
      (!rule.repositoryId || rule.repositoryId === entry.repositoryId) &&
      (!rule.ownerId || rule.ownerId === entry.ownerId) &&
      (rule.path === undefined || rule.path === entry.path) &&
      (!rule.commitSha || rule.commitSha === entry.commitSha) &&
      (!rule.contentHash || rule.contentHash === (artifact?.contentHash ?? entry.contentHash)) &&
      (!rule.artifactSha256 || rule.artifactSha256 === artifact?.artifactSha256));
}

export function validatePolicy(input, now = Date.now()) {
  const policy = policySchema.parse(input);
  if (Date.parse(policy.expiresAt) <= now || Date.parse(policy.issuedAt) > now + 60_000) fail(400, "invalid_policy_time", "Policy must be current");
  if (new Set(policy.rules.map((r) => r.id)).size !== policy.rules.length) fail(400, "duplicate_rule", "Policy rule IDs must be unique");
  return policy;
}
export function revisionIdentity(entry) {
  if (entry.path === null || !entry.commitSha || !identity(entry) || !entry.sourceRef) return null;
  const channel = entry.sourceRef.type === "tag" ? "release" : "development";
  return { channel, id: sha256(JSON.stringify([entry.key, entry.version, identity(entry), channel])) };
}
export function revisionRecord(entry, conflict, now) {
  const value = revisionIdentity(entry);
  if (!value) return null;
  return { revisionId: value.id, entryKey: entry.key, version: entry.version, sourceRef: entry.sourceRef, commitSha: entry.commitSha,
    sourceTreeHash: identity(entry), contentHash: entry.contentHash, hashScheme: entry.hashScheme, channel: value.channel,
    firstSeenAt: new Date(now).toISOString(), conflict, entry };
}
export function revisionConflict(entry, otherVersion, boundCommit) {
  return entry.sourceRef?.type === "tag" && Boolean(otherVersion || (boundCommit && boundCommit !== entry.commitSha));
}
export function observedEntry(original, old, requests, timestamp) {
  return { ...original, firstSeenAt: old?.firstSeenAt ?? timestamp,
    contentChangedAt: !old ? null : identity(old) === identity(original) ? old.contentChangedAt : timestamp, downloadRequests: requests };
}
export function validateRelease(input, current, kind) {
  const entry = entrySchema.parse(input);
  if (entry.kind !== kind || entry.sourceRef?.type !== "tag" || !current || entry.status !== "indexed" || !semver.valid(entry.version ?? "") || entry.path === null || !entry.commitSha || !identity(entry) || entry.ownerId !== current.ownerId) fail(400, "invalid_release", "Release candidates must be valid indexed versions of a current package at an exact tag");
  return entry;
}
export function queryOptions(input) {
  const options = { kind: input.kind ?? "plugins", q: (input.q ?? "").trim().slice(0, 200).toLocaleLowerCase(),
    source: input.source ?? "all", category: input.category ?? "all", locale: input.locale ?? "all",
    status: input.status ?? "all", sort: input.sort ?? (input.q?.trim() ? "relevance" : "updated"), limit: Number(input.limit ?? 24) };
  if (!["plugins", "worlds"].includes(options.kind) || !["all", "official", "community"].includes(options.source) || !["all", "indexed", "pending", "archived"].includes(options.status) || !["relevance", "updated", "name", "stars", "downloads"].includes(options.sort) || !Number.isInteger(options.limit) || options.limit < 1 || options.limit > 100) fail(400, "invalid_query", "Invalid directory filter or page size");
  return options;
}
export function searchFields(entry) {
  const names = [entry.name, entry.id, ...Object.values(entry.translations).map((t) => t.name ?? "")].join(" ").toLocaleLowerCase();
  const all = [names, entry.description, entry.repository, entry.author, entry.category, ...entry.tags, ...Object.values(entry.translations).map((t) => t.description ?? "")].join(" ").toLocaleLowerCase();
  return { names, all };
}
export function searchMatch(entry, q) {
  const { names, all } = searchFields(entry), words = q.split(/\s+/).filter(Boolean);
  return { matched: words.every((w) => all.includes(w)), score: (entry.id.toLocaleLowerCase() === q ? 100 : 0) + words.reduce((sum, w) => sum + (names.includes(w) ? 10 : all.includes(w) ? 1 : 0), 0) };
}

export function selectUpdate({ lock, current, installed, revisions, artifacts, policy, hostVersion, contractsVerified }) {
    let candidates = revisions.filter((r) => !r.conflict);
    candidates = candidates.filter((r) => !ruleFor(r.entry, undefined, policy) && r.entry.status === "indexed");
    if (lock.updatePolicy === "branch") candidates = candidates.filter((r) => current.sourceRef?.type === "branch" && current.sourceRef.name === lock.sourceRef?.name && r.revisionId === current.revisionId);
    else if (lock.updatePolicy === "stable") candidates = candidates.filter((r) => r.channel === "release" && semver.valid(r.version) && !semver.prerelease(r.version)).sort((a, b) => semver.rcompare(a.version, b.version) || b.firstSeenAt.localeCompare(a.firstSeenAt));
    else fail(400, "invalid_update_policy", "Unknown update policy");
    if (!hostVersion || !semver.valid(hostVersion) || !contractsVerified) return { state: "unknown", reason: "host-or-contract-context-missing" };
    const candidate = candidates.find((r) => r.entry.covelVersion && semver.validRange(r.entry.covelVersion) && semver.satisfies(hostVersion, r.entry.covelVersion) && artifacts.get(r.revisionId) && !ruleFor({ ...r.entry, ownerId: current.ownerId }, artifacts.get(r.revisionId), policy));
    if (!candidate) return { state: "unknown", reason: "no-verified-compatible-artifact" };
    if (candidate.sourceTreeHash === installed.sourceTreeHash || (lock.updatePolicy === "stable" && (!semver.valid(installed.version) || !semver.gt(candidate.version, installed.version)))) return { state: "current" };
    return { state: "available", candidate: { revisionId: candidate.revisionId, version: candidate.version, commitSha: candidate.commitSha, sourceRef: lock.updatePolicy === "branch" ? current.sourceRef : candidate.sourceRef }, requiresConfirmation: true, apply: "backend-restart", notice: "The Covel client must verify file and permission changes before installation." };
}
