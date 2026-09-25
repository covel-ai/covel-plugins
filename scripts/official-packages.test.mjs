import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
async function modules(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (["node_modules", "tests"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await modules(full)));
    else if (entry.name.endsWith(".js")) files.push(full);
  }
  return files;
}

for (const folder of [
  "examples/story-note",
  "examples/jev-choice-demo",
  "plugins/dashscope-image-gen",
  "plugins/openai-image-gen",
  "plugins/mimo-tts",
]) {
  test(`${folder} runs outside the workspace without dependency installation`, async () => {
    const scratch = await mkdtemp(
      path.join(os.tmpdir(), "covel-official-plugin-"),
    );
    try {
      const dest = path.join(scratch, "plugin");
      await cp(path.join(root, folder), dest, {
        recursive: true,
        filter: (source) => !source.split(path.sep).includes("node_modules"),
      });
      const pkg = JSON.parse(
        await readFile(path.join(dest, "package.json"), "utf8"),
      );
      for (const field of [
        "dependencies",
        "optionalDependencies",
        "peerDependencies",
      ]) {
        assert.equal(Object.keys(pkg[field] ?? {}).length, 0, field);
      }
      assert.ok(
        (await readFile(path.join(dest, "LICENSE"), "utf8")).includes("MIT"),
      );
      // A separate process catches bare imports that accidentally resolve through the developer checkout.
      const files = await modules(dest);
      assert.ok(files.length > 0);
      const run = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          'import { pathToFileURL } from "node:url"; for (const file of process.argv.slice(1)) await import(pathToFileURL(file));',
          ...files,
        ],
        { cwd: scratch, encoding: "utf8", timeout: 15000 },
      );
      assert.equal(
        run.status,
        0,
        run.stderr || String(run.error ?? "Import failed"),
      );
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  });
}
