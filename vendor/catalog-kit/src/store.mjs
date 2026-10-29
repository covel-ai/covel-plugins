import { DatabaseSync } from "node:sqlite";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, chmodSync } from "node:fs";
import path from "node:path";
import { parseCatalog, catalogStats } from "./schema.mjs";
import { sha256 } from "./hash.mjs";

export { ServiceError, fail } from "./core.mjs";
import { ServiceError, fail, identity, ruleFor, validatePolicy, revisionIdentity, revisionRecord, revisionConflict, observedEntry, validateRelease, queryOptions, searchMatch, selectUpdate } from "./core.mjs";
const json = (row) => row ? JSON.parse(row.data) : null;

export class CatalogStore {
  constructor(filename, { now = () => Date.now(), allowLocal = false } = {}) {
    if (filename !== ":memory:") mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(filename);
    if (filename !== ":memory:") chmodSync(filename, 0o600);
    this.now = now;
    this.allowLocal = allowLocal;
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA foreign_keys=ON;
      PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS snapshots (id TEXT PRIMARY KEY, kind TEXT NOT NULL, created INTEGER NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS current_snapshots (kind TEXT PRIMARY KEY, snapshot_id TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS snapshot_entries (snapshot_id TEXT NOT NULL, key TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(snapshot_id,key));
      CREATE TABLE IF NOT EXISTS revisions (id TEXT PRIMARY KEY, entry_key TEXT NOT NULL, version TEXT, channel TEXT NOT NULL, source_hash TEXT NOT NULL, conflict INTEGER NOT NULL, created INTEGER NOT NULL, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS revisions_by_package ON revisions(entry_key,created);
      CREATE TABLE IF NOT EXISTS observations (id TEXT PRIMARY KEY, revision_id TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS tag_bindings (entry_key TEXT NOT NULL, tag TEXT NOT NULL, commit_sha TEXT NOT NULL, PRIMARY KEY(entry_key,tag));
      CREATE TABLE IF NOT EXISTS artifacts (revision_id TEXT NOT NULL, packager_version TEXT NOT NULL, sha256 TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(revision_id,packager_version));
      CREATE TABLE IF NOT EXISTS policies (sequence INTEGER PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS counters (entry_key TEXT PRIMARY KEY, requests INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS tickets (token TEXT PRIMARY KEY, request_key TEXT UNIQUE NOT NULL, entry_key TEXT NOT NULL, revision_id TEXT NOT NULL, packager_version TEXT NOT NULL, expires INTEGER NOT NULL);
    `);
    this.db.prepare("INSERT OR IGNORE INTO settings VALUES ('cursor_secret', ?)").run(randomBytes(32).toString("hex"));
    this.cursorSecret = this.db.prepare("SELECT value FROM settings WHERE key='cursor_secret'").get().value;
  }
  close() { this.db.close(); }
  transaction(work) {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = work(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  snapshot(kind) {
    return json(this.db.prepare("SELECT s.data FROM snapshots s JOIN current_snapshots c ON c.snapshot_id=s.id WHERE c.kind=?").get(kind));
  }
  currentEntry(key) {
    return json(this.db.prepare("SELECT e.data FROM snapshot_entries e JOIN current_snapshots c ON c.snapshot_id=e.snapshot_id WHERE e.key=?").get(key));
  }
  publishPolicy(input) {
    const policy = validatePolicy(input, this.now());
    const last = this.db.prepare("SELECT sequence,data FROM policies ORDER BY sequence DESC LIMIT 1").get();
    if (last && last.sequence >= policy.sequence) {
      if (last.sequence === policy.sequence && last.data === JSON.stringify(policy)) return policy;
      fail(409, "policy_rollback", "Policy sequence must increase; publish a new sequence to restore an entry");
    }
    this.db.prepare("INSERT INTO policies VALUES (?,?)").run(policy.sequence, JSON.stringify(policy));
    return policy;
  }
  policy() {
    const policy = json(this.db.prepare("SELECT data FROM policies ORDER BY sequence DESC LIMIT 1").get());
    if (!policy || Date.parse(policy.expiresAt) <= this.now()) fail(503, "policy_unavailable", "Current directory policy is unavailable or expired");
    return policy;
  }
  ruleFor(entry, artifact, policy = this.policy()) {
    return ruleFor(entry, artifact, policy);
  }
  assertAllowed(entry, artifact) {
    const rule = this.ruleFor(entry, artifact);
    if (rule) fail(410, "withdrawn", rule.reason);
  }
  recordRevision(entry) {
    const identityValue = revisionIdentity(entry);
    if (!identityValue) return null;
    const { id, channel } = identityValue;
    let conflict = false;
    if (channel === "release") {
      const other = this.db.prepare("SELECT id FROM revisions WHERE entry_key=? AND version=? AND channel='release' AND source_hash<>? LIMIT 1").get(entry.key, entry.version, identity(entry));
      const bound = this.db.prepare("SELECT commit_sha FROM tag_bindings WHERE entry_key=? AND tag=?").get(entry.key, entry.sourceRef.name);
      conflict = revisionConflict(entry, other, bound?.commit_sha);
      if (!bound) this.db.prepare("INSERT INTO tag_bindings VALUES (?,?,?)").run(entry.key, entry.sourceRef.name, entry.commitSha);
    }
    const revision = revisionRecord(entry, conflict, this.now());
    // Immutable release payloads are never replaced. New source observations are separate.
    this.db.prepare("INSERT OR IGNORE INTO revisions VALUES (?,?,?,?,?,?,?,?)").run(id, entry.key, entry.version, channel, identity(entry), Number(conflict), this.now(), JSON.stringify(revision));
    const observation = { entryKey: entry.key, sourceRef: entry.sourceRef, commitSha: entry.commitSha, observedAt: entry.fetchedAt, conflict };
    this.db.prepare("INSERT OR IGNORE INTO observations VALUES (?,?,?)").run(sha256(JSON.stringify([entry.key, entry.sourceRef, entry.commitSha])), id, JSON.stringify(observation));
    return { revisionId: id, conflict };
  }
  publish(input, { releases = [], allowEmpty = false } = {}) {
    const catalog = parseCatalog(input);
    if (catalog.mode === "local" && !this.allowLocal) fail(400, "local_snapshot", "Local previews cannot replace a production snapshot");
    const previous = this.snapshot(catalog.kind);
    const payloadId = sha256(JSON.stringify({ catalog, releases }));
    if (previous?.inputHash === payloadId) return previous;
    if (previous && catalog.generatedAt && previous.generatedAt && catalog.generatedAt <= previous.generatedAt) fail(409, "stale_snapshot", "A newer complete snapshot is already published");
    if (previous?.entries.length && !catalog.entries.length && !allowEmpty) fail(409, "empty_snapshot", "Unexpected empty catalog; explicit acknowledgement is required");
    const currentByKey = new Map(catalog.entries.map((e) => [e.key, e]));
    const releaseEntries = releases.map((e) => validateRelease(e, currentByKey.get(e.key), catalog.kind));
    return this.transaction(() => {
      const prior = new Map((previous?.entries ?? []).map((e) => [e.key, e]));
      for (const release of releaseEntries) this.recordRevision(release);
      const timestamp = new Date(this.now()).toISOString();
      const entries = catalog.entries.map((original) => {
        const old = prior.get(original.key) ?? json(this.db.prepare("SELECT e.data FROM snapshot_entries e JOIN snapshots s ON s.id=e.snapshot_id WHERE e.key=? ORDER BY s.created DESC LIMIT 1").get(original.key));
        const entry = observedEntry(original, old, this.db.prepare("SELECT requests FROM counters WHERE entry_key=?").get(original.key)?.requests ?? 0, timestamp);
        const revision = this.recordRevision(entry);
        return { ...entry, revisionId: revision?.revisionId ?? null, ...(revision?.conflict ? { status: "pending", problems: [...entry.problems, "version-conflict"] } : {}) };
      });
      const snapshotId = sha256(`${payloadId}:${timestamp}`);
      const data = { ...catalog, entries, stats: catalogStats(entries, catalog.issues), inputHash: payloadId, snapshotId, metricsSnapshot: timestamp };
      this.db.prepare("INSERT INTO snapshots VALUES (?,?,?,?)").run(snapshotId, catalog.kind, this.now(), JSON.stringify(data));
      const insert = this.db.prepare("INSERT INTO snapshot_entries VALUES (?,?,?)");
      for (const entry of entries) insert.run(snapshotId, entry.key, JSON.stringify(entry));
      this.db.prepare("INSERT INTO current_snapshots VALUES (?,?) ON CONFLICT(kind) DO UPDATE SET snapshot_id=excluded.snapshot_id").run(catalog.kind, snapshotId);
      return data;
    });
  }
  signCursor(value) {
    const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
    return `${payload}.${createHmac("sha256", this.cursorSecret).update(payload).digest("base64url")}`;
  }
  readCursor(token) {
    if (typeof token !== "string" || token.length > 4000) fail(400, "invalid_cursor", "Invalid cursor");
    const [payload, signature, extra] = token.split(".");
    const expected = createHmac("sha256", this.cursorSecret).update(payload ?? "").digest();
    const actual = Buffer.from(signature ?? "", "base64url");
    if (extra || actual.length !== expected.length || !timingSafeEqual(actual, expected)) fail(400, "invalid_cursor", "Invalid cursor signature");
    let value;
    try { value = JSON.parse(Buffer.from(payload, "base64url").toString()); }
    catch { fail(400, "invalid_cursor", "Invalid cursor payload"); }
    if (value.expires <= this.now()) fail(409, "cursor_expired", "This result page expired; restart the search");
    return value;
  }
  list(input) {
    const policy = this.policy();
    const options = queryOptions(input);
    const queryHash = sha256(JSON.stringify({ queryVersion: 1, ...options }));
    const cursor = input.cursor ? this.readCursor(input.cursor) : null;
    if (cursor && (cursor.queryHash !== queryHash || cursor.policy !== policy.sequence)) fail(409, "cursor_changed", "Search or directory policy changed; restart the search");
    const snapshot = cursor ? json(this.db.prepare("SELECT data FROM snapshots WHERE id=?").get(cursor.snapshot)) : this.snapshot(options.kind);
    if (!snapshot) fail(503, "catalog_unavailable", "No complete catalog has been published");
    const visible = snapshot.entries.filter((entry) => !this.ruleFor(entry, this.latestArtifact(entry.revisionId), policy));
    const words = options.q.split(/\s+/).filter(Boolean);
    const match = (entry) => searchMatch(entry, options.q);
    let items = visible.filter((entry) =>
      (options.status === "all" ? entry.status !== "archived" : entry.status === options.status) &&
      (options.source === "all" || entry.official === (options.source === "official")) &&
      (options.category === "all" || entry.category === options.category) &&
      (options.locale === "all" || entry.locales.includes(options.locale)) && match(entry).matched);
    const dateValue = (e) => e.releasePublishedAt ?? e.contentChangedAt ?? e.firstSeenAt ?? "";
    const number = (n) => n ?? -1;
    items.sort((a, b) => {
      const order = options.sort === "name" ? a.name.localeCompare(b.name, "en")
        : options.sort === "stars" ? number(b.stars) - number(a.stars)
        : options.sort === "downloads" ? number(b.downloadRequests) - number(a.downloadRequests)
        : options.sort === "relevance" && words.length ? match(b).score - match(a).score
        : dateValue(b).localeCompare(dateValue(a));
      return order || a.key.localeCompare(b.key, "en");
    });
    const offset = cursor?.offset ?? 0;
    if (!Number.isInteger(offset) || offset < 0) fail(400, "invalid_cursor", "Invalid cursor offset");
    const total = items.length;
    const nextOffset = offset + options.limit;
    items = items.slice(offset, nextOffset).map((entry) => ({ ...entry, description: entry.description.slice(0, 500) }));
    return {
      schemaVersion: 1, kind: options.kind, snapshotId: snapshot.snapshotId, metricsSnapshot: snapshot.metricsSnapshot,
      generatedAt: snapshot.generatedAt, mode: snapshot.mode, topics: snapshot.topics, items, total,
      nextCursor: nextOffset < total ? this.signCursor({ snapshot: snapshot.snapshotId, policy: policy.sequence, queryHash, offset: nextOffset, expires: cursor?.expires ?? this.now() + 30 * 60_000 }) : null,
      policyVersion: policy.version,
      facets: { categories: [...new Set(visible.map((e) => e.category))].sort(), locales: [...new Set(visible.flatMap((e) => e.locales))].sort() },
    };
  }
  detail(key) {
    const entry = this.currentEntry(key);
    if (!entry) fail(404, "entry_not_found", "This package is no longer listed");
    const rule = this.ruleFor(entry, this.latestArtifact(entry.revisionId));
    return { ...entry, blocked: Boolean(rule), policyReason: rule?.reason ?? null, downloadRequests: this.db.prepare("SELECT requests FROM counters WHERE entry_key=?").get(key)?.requests ?? 0 };
  }
  versions(key) {
    const current = this.detail(key);
    return this.db.prepare("SELECT data FROM revisions WHERE entry_key=? ORDER BY created DESC,id LIMIT 200").all(key).map(json).map((revision) => {
      const artifacts = this.db.prepare("SELECT data FROM artifacts WHERE revision_id=?").all(revision.revisionId).map(json).map(({ storageKey, ...artifact }) => artifact);
      const blocked = Boolean(this.ruleFor({ ...revision.entry, ownerId: current.ownerId }, this.latestArtifact(revision.revisionId)));
      const observations = this.db.prepare("SELECT data FROM observations WHERE revision_id=? ORDER BY rowid DESC LIMIT 200").all(revision.revisionId).map(json);
      const artifact = this.latestArtifact(revision.revisionId);
      const { covelVersion, license, readmeUrl, status } = revision.entry;
      return { ...revision, contentHash: artifact?.contentHash ?? revision.contentHash, hashScheme: artifact?.hashScheme ?? revision.hashScheme, entry: undefined, metadata: { covelVersion, license, readmeUrl, status }, artifacts, blocked, observations };
    });
  }
  revision(key, id) {
    const current = this.detail(key);
    if (current.status === "archived" || current.path === null) fail(409, "not_distributable", "Package is archived or has no package path");
    const revision = json(this.db.prepare("SELECT data FROM revisions WHERE id=? AND entry_key=?").get(id ?? current.revisionId, key));
    if (!revision) fail(404, "revision_not_found", "Version is not available");
    if (revision.entry.status !== "indexed") fail(409, "not_distributable", "This revision has incomplete package metadata");
    if (revision.conflict) fail(409, "version_conflict", "This version conflicts with a previously published version");
    this.assertAllowed({ ...revision.entry, ownerId: current.ownerId });
    return { ...revision, entry: { ...revision.entry, ownerId: current.ownerId, repository: current.repository, repositoryUrl: current.repositoryUrl } };
  }
  latestArtifact(revisionId) {
    return revisionId ? json(this.db.prepare("SELECT data FROM artifacts WHERE revision_id=? ORDER BY rowid DESC LIMIT 1").get(revisionId)) : null;
  }
  artifact(revisionId, packagerVersion) {
    return json(this.db.prepare("SELECT data FROM artifacts WHERE revision_id=? AND packager_version=?").get(revisionId, packagerVersion));
  }
  saveArtifact(revisionId, artifact) {
    const old = this.artifact(revisionId, artifact.packagerVersion);
    if (old && old.artifactSha256 !== artifact.artifactSha256) fail(409, "artifact_conflict", "An artifact with this packager version already exists");
    this.db.prepare("INSERT OR IGNORE INTO artifacts VALUES (?,?,?,?)").run(revisionId, artifact.packagerVersion, artifact.artifactSha256, JSON.stringify(artifact));
    return artifact;
  }
  issueTicket(key, revisionId, artifact, requestKey) {
    return this.transaction(() => {
      const revision = this.revision(key, revisionId);
      this.assertAllowed(revision.entry, artifact);
      const existing = this.db.prepare("SELECT * FROM tickets WHERE request_key=?").get(requestKey);
      if (existing) {
        if (existing.entry_key !== key || existing.revision_id !== revisionId) fail(409, "idempotency_conflict", "This request key was already used for another version");
        if (existing.expires <= this.now()) fail(409, "request_expired", "This download request expired; start a new request");
        const originalArtifact = this.artifact(revisionId, existing.packager_version);
        if (!originalArtifact) fail(503, "artifact_missing", "Original download artifact is unavailable");
        this.assertAllowed(revision.entry, originalArtifact);
        return existing;
      }
      const token = randomBytes(32).toString("base64url");
      const expires = this.now() + 15 * 60_000;
      this.db.prepare("INSERT INTO tickets VALUES (?,?,?,?,?,?)").run(token, requestKey, key, revisionId, artifact.packagerVersion, expires);
      this.db.prepare("INSERT INTO counters VALUES (?,1) ON CONFLICT(entry_key) DO UPDATE SET requests=requests+1").run(key);
      return this.db.prepare("SELECT * FROM tickets WHERE token=?").get(token);
    });
  }
  redeem(token) {
    const ticket = this.db.prepare("SELECT * FROM tickets WHERE token=?").get(token);
    if (!ticket || ticket.expires <= this.now()) fail(410, "ticket_expired", "Download ticket is invalid or expired");
    const revision = this.revision(ticket.entry_key, ticket.revision_id);
    const artifact = this.artifact(ticket.revision_id, ticket.packager_version);
    if (!artifact) fail(404, "artifact_missing", "Download artifact is unavailable");
    this.assertAllowed(revision.entry, artifact);
    return { ticket, revision, artifact };
  }
  checkUpdate(lock, { hostVersion, locallyModified = false, contractsVerified = false } = {}) {
    const current = this.detail(lock.entryKey);
    if (current.status !== "indexed") return { state: "blocked", reason: current.status === "archived" ? "archived" : "pending-metadata" };
    if (locallyModified) return { state: "blocked", reason: "local-changes" };
    if (lock.hashScheme !== "covel-package-v1") return { state: "unknown", reason: "hash-scheme-mismatch" };
    const installed = json(this.db.prepare("SELECT data FROM revisions WHERE id=? AND entry_key=?").get(lock.revisionId, lock.entryKey));
    const artifact = this.db.prepare("SELECT data FROM artifacts WHERE revision_id=? AND sha256=?").get(lock.revisionId, lock.artifactSha256);
    if (!installed || !artifact || json(artifact).contentHash !== lock.contentHash) return { state: "unknown", reason: "unverified-source" };
    this.assertAllowed({ ...installed.entry, ownerId: current.ownerId }, json(artifact));
    if (lock.updatePolicy === "pinned") return { state: "pinned" };
    const revisions = this.db.prepare("SELECT data FROM revisions WHERE entry_key=? AND conflict=0 ORDER BY created DESC").all(lock.entryKey).map(json);
    return selectUpdate({ lock, current, installed, revisions, artifacts: new Map(revisions.map((r) => [r.revisionId, this.latestArtifact(r.revisionId)])), policy: this.policy(), hostVersion, contractsVerified });
  }
}
