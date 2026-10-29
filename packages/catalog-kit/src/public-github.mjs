import { GitHubError } from "./github.mjs";
import { ServiceError } from "./store.mjs";

const invalid = () => { throw new ServiceError(400, "invalid_endpoint", "Unsupported public repository request"); };
/** The proxy never trusts an opaque API response to tell whether its parent repo
 * is public: blobs and trees lack that field. Every subresource verifies its repo. */
export async function publicGitHubRequest(get, endpoint, options = {}, kind) {
  if (typeof endpoint !== "string" || !endpoint.startsWith("/") || endpoint.startsWith("//") || /[\x00-\x20\\#]/.test(endpoint)) invalid();
  const [pathname, query = "", extra] = endpoint.split("?");
  if (extra !== undefined) invalid();
  const params = new URLSearchParams(query);
  if ([...params.keys()].some((key) => params.getAll(key).length !== 1)) invalid();
  const checkParams = (allowed) => { if ([...params.keys()].some((key) => !allowed.includes(key))) invalid(); };
  const pageParams = () => {
    if (params.has("per_page") && !/^(?:[1-9]\d?|100)$/.test(params.get("per_page"))) invalid();
    if (params.has("page") && !/^[1-9]\d{0,6}$/.test(params.get("page"))) invalid();
  };
  if (pathname === "/search/repositories") {
    checkParams(["q", "sort", "order", "per_page", "page"]); pageParams();
    const tokens = (params.get("q") ?? "").split(" ");
    const topic = kind === "plugins" ? /^topic:covel-plugins?$/ : /^topic:covel-worlds?$/;
    if (tokens.length !== 4 || !topic.test(tokens[0]) || tokens[1] !== "is:public" || tokens[2] !== "fork:true" || !/^created:[0-9T:.Z+-]+\.\.[0-9T:.Z+-]+$/.test(tokens[3]) || params.get("sort") !== "updated" || params.get("order") !== "asc") invalid();
    const value = await get(endpoint); // search cannot claim immutable
    if (!Array.isArray(value?.items) || value.items.some((repo) => repo.private !== false)) throw new GitHubError("Search returned a repository that is not verified public");
    return value;
  }
  const numeric = /^\/repositories\/([1-9]\d*)$/.exec(pathname);
  const repository = /^\/repos\/([A-Za-z0-9-]+)\/([A-Za-z0-9_.-]+)(.*)$/.exec(pathname);
  if (!numeric && !repository) invalid();
  if (repository && [".", ".."].includes(repository[2])) invalid();
  const suffix = repository?.[3] ?? "";
  if (numeric || !suffix) checkParams([]);
  else if (suffix === "/tags") { checkParams(["per_page", "page"]); pageParams(); }
  else if (/^\/git\/trees\/(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(suffix)) { checkParams(["recursive"]); if (params.has("recursive") && params.get("recursive") !== "1") invalid(); }
  else if (/^\/git\/(?:blobs|tags)\/(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(suffix)) checkParams([]);
  else if (/^\/(?:commits|git\/ref\/tags)\/.+$/.test(suffix)) {
    checkParams([]);
    let ref; try { ref = decodeURIComponent(suffix.replace(/^\/(?:commits|git\/ref\/tags)\//, "")); } catch { invalid(); }
    if (!ref || ref.length > 255 || /[\x00-\x20\\~^:?*\[#%]/.test(ref) || ref.includes("..") || ref.includes("@{") || ref.split("/").some((part) => !part || part.startsWith(".") || part.endsWith(".lock"))) invalid();
  } else invalid();
  const base = numeric ? pathname : `/repos/${repository[1]}/${repository[2]}`;
  const repo = await get(base, { optional: true });
  if (!repo || repo.private !== false || repo.disabled) {
    if (options.optional) return null;
    throw new GitHubError("Repository is not publicly available", 404);
  }
  if (!suffix) return repo;
  return get(endpoint, options);
}
