import semver from "semver";
import { GitHubError, MetadataError, repositoryPath } from "./github.mjs";
import { sha256 } from "./hash.mjs";
import { memoryCheckpoint } from "./round.mjs";

const isSha = (value) => typeof value === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
const isTag = (value) => typeof value === "string" && value.length > 0 && value.length <= 255 && !/[\x00-\x20\x7f~^:?*\[\\]/.test(value) && !value.includes("..") && !value.includes("@{") && !value.split("/").some((part) => !part || part.startsWith(".") || part.endsWith(".") || part.endsWith(".lock"));
const encodedRef = (tag) => tag.split("/").map(encodeURIComponent).join("/");

export function tagReleasesPackage(tag, entry, packageCount) {
  const version = semver.valid(entry.version);
  if (!version) return false;
  if (entry.path === "") return packageCount === 1 && [version, `v${version}`].includes(tag);
  return [`${entry.id}/v${version}`, `${entry.path}/v${version}`].includes(tag);
}

/** Sidecar release observations, never a replacement for current topic membership.
 * now is a Date. The adapter must derive metadata ONLY from repo + commitSha;
 * tag is diagnostic context, since multiple tags of a commit share one extraction.
 * Pages, individual tag dereferences and completed commit extractions are durable.
 * Acknowledgement belongs after publication of BOTH catalog and sidecar.
 */
export async function collectReleases({ get, repositories, entries, extractAtCommit, checkpoint = memoryCheckpoint(), config = {}, now = new Date() }) {
  if (typeof get !== "function" || typeof extractAtCommit !== "function" || !Array.isArray(repositories) || !Array.isArray(entries) || !(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error("Invalid release collection arguments");
  const configHash = sha256(JSON.stringify({ protocol: 1, ...config }));
  let state = await checkpoint.load();
  if (!state || state.configHash !== configHash || state.acknowledged) state = { schemaVersion: 1, configHash, acknowledged: false, repositories: {} };
  if (state.schemaVersion !== 1 || !state.repositories || Array.isArray(state.repositories)) throw new Error("Invalid release checkpoint");
  const current = new Map(entries.filter((entry) => entry.path !== null).map((entry) => [entry.key, entry]));
  const repos = new Map();
  for (const repo of repositories) {
    if (!Number.isSafeInteger(repo.id) || repo.id <= 0 || repo.private !== false) throw new Error("Release repositories must have verified public numeric identities");
    repositoryPath(repo.full_name);
    if (entries.some((entry) => entry.repositoryId === repo.id && entry.path !== null)) repos.set(repo.id, repo);
  }
  for (const id of Object.keys(state.repositories)) if (!repos.has(Number(id))) delete state.repositories[id];
  await checkpoint.save(state);
  const save = () => checkpoint.save(state);
  for (const [id, repo] of repos) {
    const base = repositoryPath(repo.full_name);
    const identity = `${repo.full_name}:${repo.owner?.id}`;
    let progress = state.repositories[id];
    if (!progress || progress.identity !== identity) {
      progress = state.repositories[id] = { identity, nextPage: 1, listed: false, tags: [], commits: {} };
      await save();
    }
    while (!progress.listed) {
      const page = await get(`${base}/tags?per_page=100&page=${progress.nextPage}`);
      if (!Array.isArray(page) || page.length > 100 || page.some((item) => !isTag(item.name) || !isSha(item.commit?.sha))) throw new GitHubError("Invalid repository tag page");
      const names = [...progress.tags.map((item) => item.name), ...page.map((item) => item.name)];
      if (new Set(names).size !== names.length) {
        // Tags can move between nontransactional REST pages. Discard only this
        // enumeration and retry it; never publish the potentially skipped refs.
        progress.nextPage = 1; progress.listed = false; progress.tags = [];
        await save();
        throw new GitHubError("Tag membership changed during pagination; retry release collection");
      }
      progress.tags.push(...page.map((item) => ({ name: item.name })));
      progress.nextPage++;
      progress.listed = page.length < 100;
      await save();
    }
    for (const tag of progress.tags) {
      if (tag.done) continue;
      if (!tag.object) {
        const ref = await get(`${base}/git/ref/tags/${encodedRef(tag.name)}`, { optional: true });
        tag.observedAt = now.toISOString();
        if (!ref) { tag.done = true; tag.problem = "tag-removed-during-collection"; await save(); continue; }
        if (ref.ref !== `refs/tags/${tag.name}` || !isSha(ref.object?.sha)) throw new GitHubError("Invalid exact tag reference");
        tag.object = ref.object;
        tag.seen = [];
        await save();
      }
      while (tag.object.type === "tag") {
        if (tag.seen.includes(tag.object.sha) || tag.seen.length >= 32) throw new GitHubError("Cyclic or excessively nested annotated tag");
        const object = await get(`${base}/git/tags/${tag.object.sha}`, { immutable: true });
        if (object.sha !== tag.object.sha || !isSha(object.object?.sha)) throw new GitHubError("Invalid annotated tag object");
        tag.seen.push(tag.object.sha);
        tag.object = object.object;
        await save();
      }
      if (tag.object.type !== "commit") {
        tag.done = true; tag.problem = "tag-does-not-reference-a-commit"; await save(); continue;
      }
      const commitSha = tag.object.sha;
      if (!Object.hasOwn(progress.commits, commitSha)) {
        let extracted;
        try { extracted = await extractAtCommit(repo, commitSha, tag.name); }
        catch (error) {
          if (!(error instanceof MetadataError)) throw error;
          extracted = { entries: [], issues: [{ repository: repo.full_name, path: null, message: error.message }] };
        }
        const result = Array.isArray(extracted) ? { entries: extracted, issues: [] } : extracted;
        if (!result || !Array.isArray(result.entries) || !Array.isArray(result.issues)) throw new Error("Invalid release adapter result");
        if (result.entries.some((entry) => entry.repositoryId !== repo.id || entry.commitSha !== commitSha)) throw new Error("Release adapter returned another repository or commit");
        progress.commits[commitSha] = result;
        await save();
      }
      tag.done = true;
      await save();
    }
  }
  const releases = [], issues = [];
  for (const [id, repo] of repos) {
    const progress = state.repositories[id];
    if (!progress.listed || progress.tags.some((tag) => !tag.done)) throw new GitHubError("Incomplete release queue");
    for (const tag of progress.tags) {
      const issue = (path, message) => issues.push({ repository: repo.full_name, path, message: `[tag ${tag.name}] ${message}` });
      if (tag.problem) { issue(null, tag.problem); continue; }
      const result = progress.commits[tag.object.sha];
      for (const problem of result.issues) issue(problem.path, problem.message);
      for (const entry of result.entries) {
        const live = current.get(entry.key);
        if (!live || live.repositoryId !== id || live.kind !== entry.kind || live.path !== entry.path) continue;
        if (entry.status !== "indexed" || !semver.valid(entry.version) || !entry.sourceTreeHash) {
          issue(entry.path, "Package has no distributable SemVer manifest at this tag"); continue;
        }
        if (!tagReleasesPackage(tag.name, entry, result.entries.filter((item) => item.path !== null).length)) {
          issue(entry.path, "Tag is a source observation, not release evidence: use <id>/v<version> or <path>/v<version> (v<version> is allowed for a single root package)");
          continue;
        }
        // Discovery/official status comes from CURRENT membership, never an old
        // tag's owner claims. Ref and README content are pinned to the parsed SHA.
        releases.push({ ...entry, official: live.official, discovery: live.discovery,
          ownerId: live.ownerId, repository: live.repository, repositoryUrl: live.repositoryUrl,
          sourceRef: { type: "tag", name: tag.name }, installUrl: entry.pinnedUrl,
          releasePublishedAt: null, fetchedAt: tag.observedAt });
      }
    }
  }
  return { releases, issues, async acknowledge() { state.acknowledged = true; await save(); } };
}
