import { createHash } from "node:crypto";
import { readFile, readdir, lstat, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkKit } from "../catalog-kit.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
export async function checkInstalledKit(directory = root) {
  const lock = await checkKit(directory);
  const checked = new Set();
  for (const manifest of ["package.json", "site/package.json"]) {
    const resolve = createRequire(path.join(directory, manifest)).resolve;
    const installed = await realpath(path.resolve(resolve("@covel/catalog-kit/schema"), "../.."));
    if (installed === await realpath(path.join(directory, "vendor/catalog-kit"))) throw new Error("Installed catalog kit must be a copy, not the vendored source");
    if (checked.has(installed)) continue;
    const files = [];
    async function walk(relative = "") {
      for (const name of await readdir(path.join(installed, relative))) {
        // Package-manager dependency directories are covered by pnpm-lock.yaml.
        // All package source files and the vendor inventory remain exact.
        if (!relative && name === "node_modules") continue;
        const filename = path.posix.join(relative, name);
        const stat = await lstat(path.join(installed, filename));
        if (stat.isDirectory()) await walk(filename);
        else if (stat.isFile()) files.push(filename);
        else throw new Error(`Linked or unexpected installed kit file: ${filename}`);
      }
    }
    await walk();
    if (JSON.stringify(files.sort()) !== JSON.stringify(Object.keys(lock.files).sort())) throw new Error("Installed catalog kit has missing or extra files; refresh its file dependency");
    for (const [filename, expected] of Object.entries(lock.files)) {
      const actual = createHash("sha256").update(await readFile(path.join(installed, filename))).digest("hex");
      if (actual !== expected) throw new Error(`Installed catalog kit differs from its source lock: ${filename}`);
    }
    checked.add(installed);
  }
  return { files: Object.keys(lock.files).length, copies: checked.size, commit: lock.commit };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await checkInstalledKit();
  console.log(`Verified ${result.files} files in ${result.copies} installed kit copies at ${result.commit}`);
}
