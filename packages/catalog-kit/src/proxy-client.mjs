import { GitHubError } from "./github.mjs";

/** CI collection and runtime downloads can share the service's serialized GitHub
 * queue and quota. The scoped ingest credential never goes to GitHub or Pages. */
export function createRegistryGitHubClient({ apiUrl, token, kind, fetchImpl = fetch }) {
  const base = new URL(apiUrl);
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash || base.pathname !== "/" || !["plugins", "worlds"].includes(kind) || !token) throw new Error("Invalid registry collection proxy configuration");
  let requests = 0;
  const get = async (endpoint, options = {}) => {
    requests++;
    const response = await fetchImpl(`${base.href.replace(/\/$/, "")}/admin/github/${kind}`, { method: "POST", redirect: "error", signal: AbortSignal.timeout(120_000), headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ endpoint, options }) });
    if (!response.ok) throw new GitHubError(`Shared collection queue returned HTTP ${response.status}`, response.status);
    return response.json();
  };
  get.stats = () => ({ requests, transport: "shared-service" });
  return get;
}
