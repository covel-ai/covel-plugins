import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
export async function pagesWorkflow() {
  let template = await readFile(new URL("../../packages/catalog-kit/templates/pages.yml", import.meta.url), "utf8");
  const values = {
    __KIND__: "plugins", __PACKAGE_MANAGER__: "pnpm", __INSTALL_COMMAND__: "pnpm install --frozen-lockfile --ignore-scripts",
    __TEST_COMMAND__: "pnpm check && pnpm test:catalog", __COLLECT_COMMAND__: "pnpm collect", __GENERATE_COMMAND__: "pnpm collect:local",
    __BUILD_COMMAND__: "pnpm build:pages", __PUBLISH_COMMAND__: "node packages/catalog-kit/src/publish.mjs --catalog site/public/catalog.json --releases artifacts/releases.json --receipt artifacts/publish-receipt.json",
    __CONFIG_HASH_EXPRESSION__: "hashFiles('packages/catalog-kit/**', 'catalog/config.json', 'scripts/catalog/**', 'registry/plugins/**')",
  };
  template = template.replace(/^# Instantiate[^\n]*\n/, "").replace("      - uses: actions/setup-node@v4", "      - uses: pnpm/action-setup@v4\n        with:\n          version: 11.22.0\n      - uses: actions/setup-node@v4");
  for (const [name, value] of Object.entries(values)) template = template.replaceAll(name, value);
  if (/__[A-Z_]+__/.test(template)) throw new Error("Unresolved shared workflow placeholder");
  return template;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const expected = await pagesWorkflow(), filename = new URL("../../.github/workflows/pages.yml", import.meta.url);
  if (process.argv.includes("--write")) await writeFile(filename, expected);
  else if (await readFile(filename, "utf8") !== expected) throw new Error("Pages workflow differs from the shared template; regenerate with workflow.mjs --write");
  console.log("Pages workflow matches the shared template");
}
