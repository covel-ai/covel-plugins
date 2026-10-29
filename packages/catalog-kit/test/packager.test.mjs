import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { unzipSync } from "fflate";
import { createPackager, validateWorldPackage, PACKAGING_LIMITS } from "../src/packager.mjs";
import { fingerprintTree, sha256 } from "../src/hash.mjs";

const manifest = 'schemaVersion: "1.0"\nid: lantern\nname: Lantern\nsummary: An island\nversion: 1.0.0\ndefaultLocale: en-US\nsupportedLocales: [en-US]\n';
function fixture(extra = {}) {
  const content = { "worlds/lantern/world.yaml": manifest, "worlds/lantern/WORLD.md": "# Lore\r\n", "worlds/lantern/run.sh": "exit 0", "worlds/another/SECRET.md": "sibling stays out", ...extra };
  const blobs = new Map();
  const tree = Object.entries(content).map(([filename, text]) => {
    const data = Buffer.from(text);
    const sha = createHash("sha1").update(`blob ${data.length}\0`).update(data).digest("hex");
    blobs.set(sha, data);
    return { path: filename, type: "blob", mode: filename.endsWith(".sh") ? "100755" : "100644", size: data.length, sha };
  });
  const entry = { id: "lantern", version: "1.0.0", repositoryId: 123, ownerId: 456, kind: "worlds", path: "worlds/lantern", commitSha: "a".repeat(40), sourceTreeHash: fingerprintTree(tree, "worlds/lantern"), contentHash: null, status: "indexed" };
  let publicRepo = true;
  let ownerId = 456;
  let blobReads = 0;
  const get = async (endpoint) => {
    if (endpoint === "/repositories/123") return { id: 123, owner: { id: ownerId }, full_name: "author/worlds", private: !publicRepo };
    if (endpoint.includes("/commits/")) return { sha: entry.commitSha, commit: { tree: { sha: "b".repeat(40) } } };
    if (endpoint.includes("/git/trees/")) return { truncated: false, tree };
    if (endpoint.includes("/git/blobs/")) {
      blobReads++;
      const bytes = blobs.get(endpoint.split("/").at(-1));
      return { encoding: "base64", size: bytes.length, content: bytes.toString("base64") };
    }
    throw new Error(`unexpected ${endpoint}`);
  };
  return { get, entry, tree, blobs, blobReads: () => blobReads, hide: () => { publicRepo = false; }, transfer: () => { ownerId++; } };
}
const validatePackage = (kind, files, entry) => { assert.equal(kind, "worlds"); validateWorldPackage(files, entry); };
async function temporary(fn) {
  const directory = await mkdtemp(path.join(tmpdir(), "covel-package-"));
  try { return await fn(directory); } finally { await rm(directory, { recursive: true, force: true }); }
}

test("ZIP contains only selected package, has stable bytes, and keeps executable metadata", async () => temporary(async (cacheDir) => {
  const data = fixture();
  const packager = createPackager({ get: data.get, cacheDir, validatePackage });
  const artifact = await packager.prepare(data.entry);
  const bytes = await readFile(path.join(cacheDir, artifact.storageKey));
  assert.equal(artifact.artifactSha256, sha256(bytes));
  assert.equal(artifact.size, bytes.length);
  assert.match(artifact.contentHash, /^[a-f0-9]{64}$/);
  const files = unzipSync(bytes);
  assert.deepEqual(Object.keys(files), ["WORLD.md", "run.sh", "world.yaml"]);
  assert.equal(Buffer.from(files["WORLD.md"]).toString(), "# Lore\r\n");
  const readAttrs = [];
  for (let offset = 0; offset < bytes.length - 46; offset++) {
    if (bytes.readUInt32LE(offset) !== 0x02014b50) continue;
    const nameLength = bytes.readUInt16LE(offset + 28);
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString();
    readAttrs.push([name, bytes.readUInt32LE(offset + 38) >>> 16]);
  }
  assert.equal(readAttrs.find(([name]) => name === "run.sh")[1], 0o100755);
  const second = path.join(cacheDir, "fresh");
  const again = await createPackager({ get: data.get, cacheDir: second, validatePackage }).prepare(data.entry);
  assert.equal(again.artifactSha256, artifact.artifactSha256);
}));

test("concurrent requests single-flight; cached artifacts still check visibility and owner", async () => temporary(async (cacheDir) => {
  const data = fixture();
  const packager = createPackager({ get: data.get, cacheDir, validatePackage });
  const results = await Promise.all([packager.prepare(data.entry), packager.prepare(data.entry), packager.prepare(data.entry)]);
  assert.equal(new Set(results.map((item) => item.artifactSha256)).size, 1);
  assert.equal(data.blobReads(), 3);
  await packager.prepare(data.entry);
  assert.equal(data.blobReads(), 3);
  data.hide();
  await assert.rejects(packager.prepare(data.entry), /unavailable/);
}));

test("ownership change cannot inherit cached distribution permission", async () => temporary(async (cacheDir) => {
  const data = fixture();
  const packager = createPackager({ get: data.get, cacheDir, validatePackage });
  await packager.prepare(data.entry);
  data.transfer();
  await assert.rejects(packager.prepare(data.entry), /ownership changed/);
}));

test("cache and single-flight joins cannot bypass the caller's revision validation", async () => temporary(async (cacheDir) => {
  const data = fixture();
  const packager = createPackager({ get: data.get, cacheDir, validatePackage });
  const [valid, invalid] = await Promise.allSettled([
    packager.prepare(data.entry), packager.prepare({ ...data.entry, version: "2.0.0" }),
  ]);
  assert.equal(valid.status, "fulfilled"); assert.equal(invalid.status, "rejected");
  await assert.rejects(packager.prepare({ ...data.entry, version: "2.0.0" }), /identity differs/);
  await assert.rejects(packager.prepare({ ...data.entry, id: "another" }), /identity differs/);
  await assert.rejects(packager.prepare({ ...data.entry, contentHash: "d".repeat(64) }), /content differs/);
}));

test("corrupted private archive is rebuilt and verified, never returned as a cache hit", async () => temporary(async (cacheDir) => {
  const data = fixture();
  const packager = createPackager({ get: data.get, cacheDir, validatePackage });
  const artifact = await packager.prepare(data.entry);
  await writeFile(path.join(cacheDir, artifact.storageKey), "corrupted");
  const rebuilt = await packager.prepare(data.entry);
  assert.equal(rebuilt.artifactSha256, artifact.artifactSha256);
  assert.equal(data.blobReads(), 6);
}));

test("source tree drift, malformed blobs and different byte digest cannot be distributed", async () => temporary(async (cacheDir) => {
  const data = fixture();
  await assert.rejects(createPackager({ get: data.get, cacheDir, validatePackage }).prepare({ ...data.entry, sourceTreeHash: "c".repeat(64) }), /source differs/);
  const tampered = async (endpoint) => endpoint.includes("/git/blobs/") ? { encoding: "base64", content: Buffer.from("fake").toString("base64") } : data.get(endpoint);
  await assert.rejects(createPackager({ get: tampered, cacheDir, validatePackage }).prepare(data.entry), /size does not match/);
  await assert.rejects(createPackager({ get: data.get, cacheDir, validatePackage }).prepare({ ...data.entry, contentHash: "d".repeat(64) }), /content differs/);
}));

test("symlinks, submodules, traversal and case collisions are rejected", async () => temporary(async (cacheDir) => {
  for (const entry of [
    { path: "worlds/lantern/link", type: "blob", mode: "120000", size: 3, sha: "c".repeat(40) },
    { path: "worlds/lantern/module", type: "commit", mode: "160000", size: 0, sha: "c".repeat(40) },
    { path: "worlds/lantern/../escape", type: "blob", mode: "100644", size: 0, sha: "c".repeat(40) },
  ]) {
    const data = fixture();
    data.tree.push(entry);
    if (!entry.path.includes("..")) data.entry.sourceTreeHash = fingerprintTree(data.tree, data.entry.path);
    await assert.rejects(createPackager({ get: data.get, cacheDir, validatePackage }).prepare(data.entry));
  }
  const collision = fixture({ "worlds/lantern/World.yaml": "collision" });
  await assert.rejects(createPackager({ get: collision.get, cacheDir, validatePackage }).prepare(collision.entry), /ambiguous/);
}));

test("file count, uncompressed bytes and final ZIP sizes are bounded", async () => temporary(async (cacheDir) => {
  const data = fixture();
  for (const limit of [{ maxFiles: 2 }, { maxUnpackedBytes: 10 }, { maxZipBytes: 20 }]) {
    await assert.rejects(createPackager({ get: data.get, cacheDir, validatePackage, limits: { ...PACKAGING_LIMITS, ...limit } }).prepare(data.entry), /limit/);
  }
}));

test("Windows reserved characters and file/directory prefixes cannot enter an archive", async () => temporary(async (cacheDir) => {
  for (const character of '<>:"|?*') {
    const data = fixture({ [`worlds/lantern/a${character}b`]: "bad" });
    await assert.rejects(createPackager({ get: data.get, cacheDir, validatePackage }).prepare(data.entry), /nonportable/);
  }
  for (const directory of ["a", "A"]) {
    const data = fixture({ "worlds/lantern/a": "file", [`worlds/lantern/${directory}/b`]: "nested" });
    await assert.rejects(createPackager({ get: data.get, cacheDir, validatePackage }).prepare(data.entry), /file\/directory/);
  }
}));

test("the adapter rejects misleading revision identity and referenced external files", async () => temporary(async (cacheDir) => {
  const data = fixture();
  await assert.rejects(createPackager({ get: data.get, cacheDir, validatePackage }).prepare({ ...data.entry, version: "2.0.0" }), /differs/);
  const outside = fixture({ "worlds/lantern/world.yaml": `${manifest}cover: ../secret.png\n` });
  await assert.rejects(createPackager({ get: outside.get, cacheDir, validatePackage }).prepare(outside.entry), /unsafe/);
}));
