// Explicit, read-only online check. Never run this from a PR or unit-test job.
import path from "node:path";
import { createGitHubClient, diskCache, repositoryPath, repositoryTree, readBlob, discoverRepositories } from "@covel/catalog-kit/github";
import { createPackager } from "@covel/catalog-kit/packager";
import { extractPlugins, validatePluginPackage } from "./metadata.mjs";
import { loadInputs, root, writeJson } from "./collect.mjs";

const { config } = await loadInputs();
const get = createGitHubClient({ cache: diskCache(path.join(root, ".cache/smoke/github")), maxRequests: 70, maxWaitMs: 5000 });
const names = await discoverRepositories(get, config.topics);
const repo = await get(repositoryPath("covel-ai/covel-plugins"));
if (repo.private !== false) throw new Error("Smoke repository must be public");
const source = await repositoryTree(get, repo);
const result = await extractPlugins({ repo, ...source, config, discovery: "seed", fetchedAt: new Date().toISOString(), read: (file) => readBlob(get, repositoryPath(repo.full_name), file) });
const entry = result.entries.find((entry) => entry.id === "story-note" && entry.status === "indexed");
if (!entry) throw new Error("Official story-note package did not validate");
const packager = createPackager({ get, cacheDir: path.join(root, ".cache/smoke/artifacts"), validatePackage: (_, files, entry) => validatePluginPackage(files, entry) });
const artifact = await packager.prepare(entry);
const report = { checkedAt: new Date().toISOString(), topicRepositories: names.length, repositoryId: repo.id, commitSha: source.commitSha, packages: result.entries.length, artifact: { ...artifact, storageKey: undefined }, api: get.stats() };
await writeJson(report, path.join(root, "artifacts/online-smoke.json"));
console.log(JSON.stringify(report, null, 2));
