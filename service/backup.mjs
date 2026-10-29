import { DatabaseSync, backup } from "node:sqlite";
import { mkdir, copyFile, readdir, lstat, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { sha256 } from "../packages/catalog-kit/src/hash.mjs";

/** SQLite's backup API includes WAL transactions. Never copy only the live .sqlite
 * file. Content-addressed artifacts are immutable; copy them and verify hashes. */
export async function backupCatalog(dataDirectory, destination) {
  await mkdir(destination, { mode: 0o700 }); // an existing backup is never overwritten
  const db = new DatabaseSync(path.join(dataDirectory, "catalog.sqlite"));
  try { await backup(db, path.join(destination, "catalog.sqlite")); } finally { db.close(); }
  await mkdir(path.join(destination, "artifacts"), { mode: 0o700 });
  const check = new DatabaseSync(path.join(destination, "catalog.sqlite"), { readOnly: true });
  let artifacts;
  try { artifacts = check.prepare("SELECT data FROM artifacts").all().map((r) => JSON.parse(r.data)); } finally { check.close(); }
  const manifest = {};
  for (const artifact of artifacts) {
    if (!/^[a-f0-9]{64}\.zip$/.test(artifact.storageKey)) throw new Error("Invalid artifact path in ledger");
    const source = path.join(dataDirectory, "artifacts", artifact.storageKey);
    const stat = await lstat(source);
    if (!stat.isFile() || stat.size !== artifact.size) throw new Error("Artifact missing or not a regular file");
    const bytes = await readFile(source);
    if (sha256(bytes) !== artifact.artifactSha256) throw new Error("Artifact does not match its ledger checksum");
    await copyFile(source, path.join(destination, "artifacts", artifact.storageKey));
    manifest[artifact.storageKey] = artifact.artifactSha256;
  }
  await writeFile(path.join(destination, "backup.json"), JSON.stringify({ schemaVersion: 1, createdAt: new Date().toISOString(), databaseSha256: sha256(await readFile(path.join(destination, "catalog.sqlite"))), artifacts: manifest }, null, 2), { mode: 0o600 });
}
export async function verifyBackup(directory) {
  const record = JSON.parse(await readFile(path.join(directory, "backup.json"), "utf8"));
  if (record.schemaVersion !== 1 || sha256(await readFile(path.join(directory, "catalog.sqlite"))) !== record.databaseSha256) throw new Error("Backup database checksum mismatch");
  for (const [filename, digest] of Object.entries(record.artifacts)) {
    if (!/^[a-f0-9]{64}\.zip$/.test(filename) || sha256(await readFile(path.join(directory, "artifacts", filename))) !== digest) throw new Error("Backup artifact checksum mismatch");
  }
  const db = new DatabaseSync(path.join(directory, "catalog.sqlite"), { readOnly: true });
  try { if (db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok") throw new Error("Backup integrity check failed"); } finally { db.close(); }
  return record;
}
if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  if (process.argv[2] === "verify" && process.argv[3]) { await verifyBackup(process.argv[3]); console.log("Backup verified"); }
  else if (process.argv[2] === "create" && process.argv[3] && process.argv[4]) { await backupCatalog(process.argv[3], process.argv[4]); console.log("Backup created"); }
  else throw new Error("Usage: backup.mjs create DATA_DIRECTORY NEW_BACKUP_DIRECTORY | verify BACKUP_DIRECTORY");
}
