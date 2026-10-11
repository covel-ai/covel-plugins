// Validates every package in this repository with a Covel checkout's own
// static validator: `COVEL_DIR=/path/to/covel pnpm check:covel`.
// The checkout must have run `pnpm install`; check out the release you target.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const covel = process.env.COVEL_DIR;
if (!covel || !existsSync(path.join(covel, "packages/plugin-loader"))) {
  console.error("Set COVEL_DIR to a Covel checkout with dependencies installed.");
  process.exit(2);
}
const packages = ["plugins", "examples"].flatMap((group) =>
  readdirSync(path.join(root, group), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, group, entry.name))
    .filter((dir) => existsSync(path.join(dir, "PLUGIN.md"))),
);
let failed = 0;
for (const dir of packages) {
  const run = spawnSync("pnpm", ["validate:plugin", dir], {
    cwd: covel,
    encoding: "utf8",
  });
  const output = `${run.stdout}${run.stderr}`
    .split("\n")
    .filter((line) => line && !line.startsWith("$") && !line.startsWith(">"))
    .join("\n");
  console.log(output);
  if (run.status !== 0) failed += 1;
}
console.log(`${packages.length - failed}/${packages.length} packages pass Covel validation`);
process.exit(failed ? 1 : 0);
