import path from "node:path";
import { createCatalogServer, CatalogStore } from "../packages/catalog-kit/src/server.mjs";
import { createGitHubClient, diskCache } from "../packages/catalog-kit/src/github.mjs";
import { createPackager, validateWorldPackage } from "../packages/catalog-kit/src/packager.mjs";
import { validatePluginPackage } from "../scripts/catalog/metadata.mjs";

const dataDir = path.resolve(process.env.CATALOG_DATA_DIR ?? "service/data");
const publicUrl = process.env.CATALOG_PUBLIC_URL ?? "http://127.0.0.1:8787";
const tokens = { plugins: process.env.CATALOG_PLUGINS_TOKEN, worlds: process.env.CATALOG_WORLDS_TOKEN, policy: process.env.CATALOG_POLICY_TOKEN };
for (const [kind, token] of Object.entries(tokens)) if (token !== undefined && token.length < 32) throw new Error(`${kind} service token must contain at least 32 characters`);
const configured = Object.values(tokens).filter(Boolean);
if (new Set(configured).size !== configured.length) throw new Error("Use separate credentials for plugins, worlds and policy publication");
const allowedOrigins = (process.env.CATALOG_ALLOWED_ORIGINS ?? "http://127.0.0.1:5173,http://127.0.0.1:5174").split(",").filter(Boolean);
for (const origin of allowedOrigins) if (new URL(origin).origin !== origin) throw new Error("Allowed origins must be exact origins, without a path");
const apiCache = diskCache(path.join(dataDir, "github"));
let budgetStarted = Date.now(), client;
let queue = Promise.resolve();
function get(endpoint, options) {
  const pending = queue.then(() => {
    if (!client || Date.now() - budgetStarted >= 60 * 60_000) {
      client = createGitHubClient({ cache: apiCache, maxRequests: Number(process.env.GITHUB_REQUEST_BUDGET ?? 4500) });
      budgetStarted = Date.now();
    }
    return client(endpoint, options);
  });
  queue = pending.catch(() => {});
  return pending;
}
const cacheDir = path.join(dataDir, "artifacts");
const packager = createPackager({ get, cacheDir, validatePackage: (kind, files, entry) => {
  if (kind === "plugins") return validatePluginPackage(files, entry);
  if (kind === "worlds") return validateWorldPackage(files, entry);
  throw new Error("Unsupported package kind");
} });
const store = new CatalogStore(path.join(dataDir, "catalog.sqlite"));
const server = createCatalogServer({ store, packager, get, cacheDir, publicUrl, allowedOrigins, tokens });
server.listen(Number(process.env.PORT ?? 8787), process.env.HOST ?? "127.0.0.1", () => console.log(`Covel directory service listening on ${publicUrl}`));
function close() { server.close(() => { store.close(); process.exit(0); }); setTimeout(() => process.exit(1), 10_000).unref(); }
process.once("SIGTERM", close); process.once("SIGINT", close);
