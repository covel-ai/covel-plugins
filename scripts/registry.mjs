import { readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Validate the deliberately small JSON Schema vocabulary used by this index.
// Unknown keywords fail closed so extending the schema cannot silently weaken CI.
export function validate(schema, value, at = "entry") {
  const keywords = new Set([
    "$schema",
    "title",
    "type",
    "enum",
    "pattern",
    "minLength",
    "minItems",
    "uniqueItems",
    "items",
    "required",
    "properties",
    "additionalProperties",
    "propertyNames",
  ]);
  for (const key of Object.keys(schema))
    if (!keywords.has(key))
      throw new Error(`Unsupported schema keyword: ${key}`);
  const fail = (message) => {
    throw new Error(`${at}: ${message}`);
  };
  const type =
    value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  if (schema.type && ![schema.type].flat().includes(type)) fail("invalid type");
  if (schema.enum && !schema.enum.includes(value)) fail("invalid enum value");
  if (typeof value === "string") {
    if (value.length < (schema.minLength ?? 0)) fail("empty string");
    if (schema.pattern && !new RegExp(schema.pattern).test(value))
      fail("invalid format");
  }
  if (Array.isArray(value)) {
    if (value.length < (schema.minItems ?? 0)) fail("too few items");
    if (
      schema.uniqueItems &&
      new Set(value.map((v) => JSON.stringify(v))).size !== value.length
    )
      fail("duplicate items");
    value.forEach((v, i) => validate(schema.items, v, `${at}[${i}]`));
  } else if (value && typeof value === "object") {
    for (const key of schema.required ?? [])
      if (!(key in value)) fail(`missing ${key}`);
    for (const [key, v] of Object.entries(value)) {
      if (schema.propertyNames)
        validate(schema.propertyNames, key, `${at} key`);
      if (!Object.hasOwn(schema.properties ?? {}, key)) {
        if (schema.additionalProperties === false) fail(`unknown field ${key}`);
        if (
          schema.additionalProperties &&
          typeof schema.additionalProperties === "object"
        )
          validate(schema.additionalProperties, v, `${at}.${key}`);
      } else validate(schema.properties[key], v, `${at}.${key}`);
    }
  }
}

export function validateEntry(schema, entry, filename) {
  validate(schema, entry, filename);
  if (Object.hasOwn(entry.translations ?? {}, "en-US"))
    throw new Error(
      `${filename}: English belongs in the base name, description and notes fields`,
    );
  if (`${entry.id}.json` !== filename)
    throw new Error(`${filename}: filename must match plugin id`);
  if (entry.status === "active" && (!entry.license || !entry.covelVersion))
    throw new Error(
      `${filename}: active entries need a license and Covel version`,
    );
  if (
    entry.maintainer === "official" &&
    !entry.repository.startsWith("https://github.com/covel-ai/")
  )
    throw new Error(
      `${filename}: official entries must use the Covel organization`,
    );
  if (entry.demo) {
    const url = new URL(entry.demo);
    if (url.protocol !== "https:" || url.username || url.password)
      throw new Error(
        `${filename}: demo must be an HTTPS URL without credentials`,
      );
  }
  if (entry.ref.split("/").some((s) => !s || s === "." || s === ".."))
    throw new Error(`${filename}: invalid ref`);
}

const escape = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("|", "&#124;")
    .replaceAll("[", "&#91;")
    .replaceAll("]", "&#93;")
    .replace(/[\r\n]+/g, " ");
const textSchema = { type: "string", minLength: 1 };
const localeSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "locale",
    "label",
    "readme",
    "official",
    "community",
    "columns",
    "status",
    "unknownVersion",
    "demo",
    "install",
    "source",
    "empty",
  ],
  properties: {
    locale: {
      type: "string",
      pattern: "^[a-z]{2,3}(-[A-Z][a-z]{3})?(-[A-Z]{2})?$",
    },
    label: textSchema,
    readme: { type: "string", pattern: "^README(?:\\.[A-Za-z0-9-]+)?\\.md$" },
    official: textSchema,
    community: textSchema,
    columns: { type: "array", minItems: 7, items: textSchema },
    status: {
      type: "object",
      additionalProperties: false,
      required: ["active", "pending", "archived"],
      properties: {
        active: textSchema,
        pending: textSchema,
        archived: textSchema,
      },
    },
    unknownVersion: textSchema,
    demo: textSchema,
    install: textSchema,
    source: textSchema,
    empty: textSchema,
  },
};

export function validateLocales(locales) {
  validate(
    { type: "array", minItems: 1, items: localeSchema },
    locales,
    "locales",
  );
  const ids = new Set();
  const files = new Set();
  for (const locale of locales) {
    const expected =
      locale.locale === "en-US" ? "README.md" : `README.${locale.locale}.md`;
    if (
      locale.readme !== expected ||
      ids.has(locale.locale) ||
      files.has(locale.readme)
    )
      throw new Error(
        "README locales and filenames must be unique and follow README.<locale>.md",
      );
    if (locale.columns.length !== 7)
      throw new Error("README tables require seven column labels");
    ids.add(locale.locale);
    files.add(locale.readme);
  }
  if (locales[0].locale !== "en-US")
    throw new Error("English must be the first README locale");
}

export function renderLanguages(locales, currentLocale) {
  return locales
    .map((locale) =>
      locale.locale === currentLocale
        ? `**${escape(locale.label)}**`
        : `[${escape(locale.label)}](${locale.readme})`,
    )
    .join(" · ");
}

export function renderTable(entries, locale) {
  const rows = [...entries]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((e) => {
      const translated = e.translations?.[locale.locale];
      const install = `${e.repository}/tree/${encodeURIComponent(e.ref)}${e.path ? `/${e.path}` : ""}`;
      return `| [${escape(translated?.name ?? e.name)}](${e.repository}) | ${escape(translated?.description ?? e.description)} | ${escape(e.author)} | ${escape(e.covelVersion ?? locale.unknownVersion)} | ${escape(locale.status[e.status])} | ${e.demo ? `[${escape(locale.demo)}](${new URL(e.demo).href.replaceAll("(", "%28").replaceAll(")", "%29").replaceAll("|", "%7C")})` : "—"} | ${e.status === "active" ? `[${escape(locale.install)}](${install})` : `[${escape(locale.source)}](${e.repository})`} |`;
    });
  return [
    `| ${locale.columns.map(escape).join(" | ")} |`,
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

export function renderDirectory(entries, locale) {
  return ["official", "community"]
    .map((maintainer) => {
      const group = entries.filter((e) => e.maintainer === maintainer);
      return `### ${escape(locale[maintainer])}\n\n${group.length ? renderTable(group, locale) : escape(locale.empty)}`;
    })
    .join("\n\n");
}

function replaceSection(original, section, content, filename) {
  const start = `<!-- ${section}:start -->`;
  const end = `<!-- ${section}:end -->`;
  if (
    original.split(start).length !== 2 ||
    original.split(end).length !== 2 ||
    original.indexOf(start) > original.indexOf(end)
  ) {
    throw new Error(`${filename}: expected exactly one ${section} section`);
  }
  return (
    original.slice(0, original.indexOf(start)) +
    `${start}\n${content}\n${end}` +
    original.slice(original.indexOf(end) + end.length)
  );
}

export async function generate(check = false, directory = root) {
  const schema = JSON.parse(
    await readFile(path.join(directory, "registry/schema.json"), "utf8"),
  );
  const locales = JSON.parse(
    await readFile(path.join(directory, "registry/locales.json"), "utf8"),
  );
  validateLocales(locales);
  const dir = path.join(directory, "registry/plugins");
  const filenames = (await readdir(dir))
    .filter((f) => f.endsWith(".json"))
    .sort();
  const entries = [];
  const ids = new Set();
  for (const filename of filenames) {
    const entry = JSON.parse(await readFile(path.join(dir, filename), "utf8"));
    validateEntry(schema, entry, filename);
    if (ids.has(entry.id)) throw new Error(`Duplicate id: ${entry.id}`);
    ids.add(entry.id);
    entries.push(entry);
  }
  // Read and validate every page before writing any generated content.
  const pages = [];
  for (const locale of locales) {
    const filename = path.join(directory, locale.readme);
    const original = await readFile(filename, "utf8");
    let updated = replaceSection(
      original,
      "languages",
      renderLanguages(locales, locale.locale),
      locale.readme,
    );
    updated = replaceSection(
      updated,
      "registry",
      renderDirectory(entries, locale),
      locale.readme,
    );
    if (check && updated !== original)
      throw new Error(
        `${locale.readme} is stale; run node scripts/registry.mjs`,
      );
    pages.push({ filename, updated });
  }
  if (!check)
    for (const page of pages) await writeFile(page.filename, page.updated);
  console.log(
    `Validated ${entries.length} plugin entries across ${locales.length} README languages`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await generate(process.argv.includes("--check"));
}
