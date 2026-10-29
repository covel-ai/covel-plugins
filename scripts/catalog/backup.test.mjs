import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { backupCatalog, verifyBackup } from "../../service/backup.mjs";
import { CatalogStore } from "../../packages/catalog-kit/src/store.mjs";
import { sha256 } from "../../packages/catalog-kit/src/hash.mjs";
import { catalog, policy, time } from "../../packages/catalog-kit/test/fixtures.mjs";

test("online backup restores WAL ledger, policies, counters and exact old artifacts", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "covel-backup-"));
  let store, restored;
  try {
    const data = path.join(dir, "data"), backup = path.join(dir, "backup"), target = path.join(dir, "restored");
    store = new CatalogStore(path.join(data, "catalog.sqlite"), { now: () => Date.parse(time) }); store.publishPolicy(policy());
    const entry = store.publish(catalog()).entries[0], bytes = Buffer.from("immutable artifact"), digest = sha256(bytes);
    const artifact = { artifactSha256: digest, contentHash: "c".repeat(64), hashScheme: "covel-package-v1", packagerVersion: "v1", size: bytes.length, filename: "demo.zip", storageKey: `${digest}.zip` };
    await mkdir(path.join(data, "artifacts")); await writeFile(path.join(data, "artifacts", artifact.storageKey), bytes);
    store.saveArtifact(entry.revisionId, artifact); const ticket = store.issueTicket(entry.key, entry.revisionId, artifact, "backup-request-000001");
    await backupCatalog(data, backup); await verifyBackup(backup); await cp(backup, target, { recursive: true });
    restored = new CatalogStore(path.join(target, "catalog.sqlite"), { now: () => Date.parse(time) });
    assert.equal(restored.detail(entry.key).downloadRequests, 1); assert.equal(restored.redeem(ticket.token).artifact.artifactSha256, digest); assert.equal(restored.policy().sequence, 1);
    await assert.rejects(backupCatalog(data, backup), /EEXIST/);
    await writeFile(path.join(backup, "artifacts", artifact.storageKey), "corrupt"); await assert.rejects(verifyBackup(backup), /checksum/);
  } finally { store?.close(); restored?.close(); await rm(dir, { recursive: true, force: true }); }
});
