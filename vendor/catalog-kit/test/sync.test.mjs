import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkKit, syncKit, REPOSITORY } from "../tools/sync.mjs";

test("fixed-commit sync ignores dirty files and detects drift, links and provenance", async () => {
  const temp = await mkdtemp(path.join(tmpdir(), "covel-sync-"));
  try {
    const source = path.join(temp, "upstream"), directory = path.join(temp, "consumer");
    await mkdir(path.join(source, "packages/catalog-kit"), { recursive: true });
    const git = (...args) => execFileSync("git", ["-C", source, ...args], { encoding: "utf8" }).trim();
    git("init", "-b", "main");
    const pkg = path.join(source, "packages/catalog-kit/package.json");
    await writeFile(pkg, '{"version":"0.2.0"}');
    git("add", "."); git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "fixture");
    const commit = git("rev-parse", "HEAD");
    await writeFile(pkg, '{"version":"uncommitted"}');
    const lock = await syncKit({ source, directory, commit });
    assert.equal(lock.kitVersion, "0.2.0"); assert.equal(lock.repository, REPOSITORY);
    const target = path.join(directory, "vendor/catalog-kit/package.json");
    const original = await readFile(target);
    await writeFile(target, "changed"); await assert.rejects(checkKit(directory), /modified/);
    await assert.rejects(syncKit({ source, directory, commit }), /modified/);
    await rm(target); await assert.rejects(checkKit(directory), /missing or extra/);
    await writeFile(target, original);
    const extra = path.join(directory, "vendor/catalog-kit/extra");
    await writeFile(extra, "extra"); await assert.rejects(checkKit(directory), /missing or extra/);
    await rm(extra); await symlink(target, extra); await assert.rejects(checkKit(directory), /Linked/);
    await rm(extra); await checkKit(directory);
    await assert.rejects(syncKit({ source, directory, commit: "main" }), /full fixed commit/);
    const filename = path.join(directory, "catalog-kit.lock.json");
    await writeFile(filename, JSON.stringify({ ...lock, repository: "https://github.com/covel-ai/covel-plugins" }));
    await assert.rejects(checkKit(directory), /provenance/);
    await assert.rejects(syncKit({ source, directory, commit }), /provenance/);
    await syncKit({ source, directory, commit, migrateFromPlugins: true });
    assert.equal((await checkKit(directory)).repository, REPOSITORY);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
