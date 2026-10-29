import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { checkInstalledKit } from "./check-installed-kit.mjs";

test("root and site installed copies must match the pinned source, including stale or extra files", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "covel-installed-kit-"));
  try {
    await cp(new URL("../../vendor", import.meta.url), path.join(directory, "vendor"), { recursive: true });
    await cp(new URL("../../catalog-kit.lock.json", import.meta.url), path.join(directory, "catalog-kit.lock.json"));
    for (const prefix of ["", "site"]) {
      const parent = path.join(directory, prefix);
      await mkdir(path.join(parent, "node_modules/@covel"), { recursive: true });
      await writeFile(path.join(parent, "package.json"), '{"type":"module"}');
      await cp(path.join(directory, "vendor/catalog-kit"), path.join(parent, "node_modules/@covel/catalog-kit"), { recursive: true });
    }
    assert.equal((await checkInstalledKit(directory)).copies, 2);
    const installed = path.join(directory, "site/node_modules/@covel/catalog-kit");
    const target = path.join(installed, "src/types.ts"), original = await readFile(target);
    await writeFile(target, "stale installed source");
    await assert.rejects(checkInstalledKit(directory), /differs from its source lock/);
    await writeFile(target, original);
    await writeFile(path.join(installed, "stale-file.mjs"), "extra");
    await assert.rejects(checkInstalledKit(directory), /missing or extra/);
    await rm(path.join(installed, "stale-file.mjs"));
    await rm(target); await assert.rejects(checkInstalledKit(directory), /missing or extra/);
    await writeFile(target, original);
    await rm(installed, { recursive: true });
    await symlink(path.join(directory, "vendor/catalog-kit"), installed);
    await assert.rejects(checkInstalledKit(directory), /must be a copy/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
