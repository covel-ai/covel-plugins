import { readFile } from "node:fs/promises";
import { themeBootstrap } from "@covel/catalog-kit/tools/theme-bootstrap";

const html = await readFile(new URL("../../site/index.html", import.meta.url), "utf8");
const blocks = html.match(/<!-- covel-theme:start -->[\s\S]*?<!-- covel-theme:end -->/g) ?? [];
if (blocks.length !== 1 || blocks[0] !== themeBootstrap()) {
  throw new Error("Theme bootstrap differs from the pinned kit; replace the head block with its theme-bootstrap.mjs output");
}
if (!/<html\b[^>]*\bclass="dark"/.test(html) || /<meta\b[^>]*name="theme-color"/i.test(html)) {
  throw new Error("The page must start with html.dark and no conflicting fixed theme-color");
}
console.log("First-paint theme matches the shared kit");
