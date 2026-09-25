import { readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Validate the deliberately small JSON Schema vocabulary used by this index.
// Unknown keywords fail closed so extending the schema cannot silently weaken CI.
export function validate(schema, value, at = "entry") {
  const keywords = new Set(["$schema", "title", "type", "enum", "pattern", "minLength", "minItems", "uniqueItems", "items", "required", "properties", "additionalProperties"]);
  for (const key of Object.keys(schema)) if (!keywords.has(key)) throw new Error(`Unsupported schema keyword: ${key}`);
  const fail = message => { throw new Error(`${at}: ${message}`); };
  const type = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  if (schema.type && ![schema.type].flat().includes(type)) fail("invalid type");
  if (schema.enum && !schema.enum.includes(value)) fail("invalid enum value");
  if (typeof value === "string") {
    if (value.length < (schema.minLength ?? 0)) fail("empty string");
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) fail("invalid format");
  }
  if (Array.isArray(value)) {
    if (value.length < (schema.minItems ?? 0)) fail("too few items");
    if (schema.uniqueItems && new Set(value.map(v => JSON.stringify(v))).size !== value.length) fail("duplicate items");
    value.forEach((v, i) => validate(schema.items, v, `${at}[${i}]`));
  } else if (value && typeof value === "object") {
    for (const key of schema.required ?? []) if (!(key in value)) fail(`missing ${key}`);
    for (const [key, v] of Object.entries(value)) {
      if (!(key in schema.properties)) {
        if (schema.additionalProperties === false) fail(`unknown field ${key}`);
      } else validate(schema.properties[key], v, `${at}.${key}`);
    }
  }
}

export function validateEntry(schema, entry, filename) {
  validate(schema, entry, filename);
  if (`${entry.id}.json` !== filename) throw new Error(`${filename}: filename must match plugin id`);
  if (entry.status === "active" && (!entry.license || !entry.covelVersion)) throw new Error(`${filename}: active entries need a license and Covel version`);
  if (entry.maintainer === "official" && !entry.repository.startsWith("https://github.com/covel-ai/")) throw new Error(`${filename}: official entries must use the Covel organization`);
  if (entry.demo) {
    const url = new URL(entry.demo);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error(`${filename}: demo must be an HTTPS URL without credentials`);
  }
  if (entry.ref.split("/").some(s => !s || s === "." || s === "..")) throw new Error(`${filename}: invalid ref`);
}

const escape = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("|", "&#124;").replaceAll("[", "&#91;").replaceAll("]", "&#93;").replace(/[\r\n]+/g, " ");
export function renderTable(entries) {
  const status = { active: "可用", pending: "待确认", archived: "已归档" };
  const rows = entries.map(e => {
    const install = `${e.repository}/tree/${encodeURIComponent(e.ref)}${e.path ? `/${e.path}` : ""}`;
    return `| [${escape(e.name)}](${e.repository}) | ${escape(e.description)} | ${e.maintainer === "official" ? "官方" : "社区"} · ${escape(e.author)} | ${escape(e.covelVersion ?? "待确认")} | ${status[e.status]} | ${e.demo ? `[演示](${new URL(e.demo).href.replaceAll("(", "%28").replaceAll(")", "%29").replaceAll("|", "%7C")})` : "—"} | ${e.status === "active" ? `[安装来源](${install})` : `[来源](${e.repository})`} |`;
  });
  return ["| 插件 | 功能 | 维护者 | Covel 版本 | 状态 | 演示 | 安装来源 |", "| --- | --- | --- | --- | --- | --- | --- |", ...rows].join("\n");
}

export async function generate(check = false) {
  const schema = JSON.parse(await readFile(path.join(root, "registry/schema.json"), "utf8"));
  const dir = path.join(root, "registry/plugins");
  const filenames = (await readdir(dir)).filter(f => f.endsWith(".json")).sort();
  const entries = [];
  const ids = new Set();
  for (const filename of filenames) {
    const entry = JSON.parse(await readFile(path.join(dir, filename), "utf8"));
    validateEntry(schema, entry, filename);
    if (ids.has(entry.id)) throw new Error(`Duplicate id: ${entry.id}`);
    ids.add(entry.id);
    entries.push(entry);
  }
  const readmePath = path.join(root, "README.md");
  const original = await readFile(readmePath, "utf8");
  const marker = /<!-- registry:start -->[\s\S]*?<!-- registry:end -->/;
  if (!marker.test(original)) throw new Error("README registry markers missing");
  const updated = original.replace(marker, `<!-- registry:start -->\n${renderTable(entries)}\n<!-- registry:end -->`);
  if (check && updated !== original) throw new Error("README is stale; run node scripts/registry.mjs");
  if (!check) await writeFile(readmePath, updated);
  console.log(`Validated ${entries.length} plugin entries`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generate(process.argv.includes("--check"));
}
