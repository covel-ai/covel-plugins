import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkKit, syncKit, kitCli } from "../vendor/catalog-kit/tools/sync.mjs";
export { checkKit, syncKit };
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await kitCli(process.argv.slice(2), fileURLToPath(new URL("../", import.meta.url)));
}
