import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCatalog, entrySchema, policySchema } from "./schema.mjs";

export function serviceUrl(input) {
  const url = new URL(input);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("Catalog service must be an HTTPS origin without credentials, path, query or fragment");
  return url.origin;
}

/** The collector has no publication credential. Invoke this only after its full
 * catalog AND release sidecar have succeeded. Never follow a credentialed redirect.
 */
export async function publishCatalog({ url, token, catalog: input, releases = [], fetchImpl = fetch, now = new Date(), timeoutMs = 30_000 }) {
  const base = serviceUrl(url);
  if (typeof token !== "string" || token.length < 24 || /[\s\x00-\x1f\x7f]/.test(token)) throw new Error("A scoped catalog ingestion credential is required");
  const catalog = parseCatalog(input);
  if (catalog.mode !== "github" || !catalog.generatedAt) throw new Error("A local preview cannot be published to the shared service");
  if (!Array.isArray(releases)) throw new Error("Release sidecar must be an array");
  const payload = JSON.stringify({ catalog, releases: releases.map((entry) => entrySchema.parse(entry)), allowEmpty: false });
  if (Buffer.byteLength(payload) > 64 * 1024 * 1024) throw new Error("Snapshot exceeds the service ingestion limit");
  const options = () => ({ redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
  const policyResponse = await fetchImpl(`${base}/v1/policy`, options());
  if (!policyResponse.ok) throw new Error(`Directory policy preflight failed (HTTP ${policyResponse.status})`);
  const policy = policySchema.parse(await policyResponse.json());
  if (Date.parse(policy.expiresAt) <= now.getTime() || Date.parse(policy.issuedAt) > now.getTime() + 60_000) throw new Error("Directory policy is expired or not yet valid");
  const response = await fetchImpl(`${base}/admin/snapshots/${catalog.kind}`, { ...options(), method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: payload });
  // Service error bodies and fetch exceptions are intentionally not printed by
  // the CLI: neither proxy headers nor credentials belong in CI logs.
  if (!response.ok) throw new Error(`Snapshot ingestion failed (HTTP ${response.status}); Pages must not deploy`);
  const result = await response.json();
  if (!/^[a-f0-9]{64}$/.test(result?.snapshotId) || !result.stats || typeof result.stats !== "object") throw new Error("Invalid snapshot ingestion receipt");
  return { snapshotId: result.snapshotId, stats: result.stats, policyVersion: policy.version };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2), files = {};
    for (let i = 0; i < args.length; i += 2) {
      if (!["--catalog", "--releases", "--receipt"].includes(args[i]) || !args[i + 1]) throw new Error("Usage: publish.mjs --catalog <file> --releases <file> [--receipt <file>]");
      files[args[i].slice(2)] = args[i + 1];
    }
    if (!files.catalog || !files.releases) throw new Error("Catalog and release files are both required");
    const result = await publishCatalog({ url: process.env.CATALOG_API_URL, token: process.env.CATALOG_INGEST_TOKEN,
      catalog: JSON.parse(await readFile(files.catalog, "utf8")), releases: JSON.parse(await readFile(files.releases, "utf8")) });
    if (files.receipt) {
      await mkdir(path.dirname(files.receipt), { recursive: true });
      await writeFile(files.receipt, `${JSON.stringify(result, null, 2)}\n`);
    }
    console.log(`Published complete snapshot ${result.snapshotId}`);
  } catch {
    console.error("Catalog publication failed. Verify complete input files, current policy, HTTPS service availability and the scoped ingestion credential. Pages was not authorized to deploy.");
    process.exitCode = 1;
  }
}
