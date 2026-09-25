import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateEntry, renderTable } from "./registry.mjs";
const schema = JSON.parse(await readFile(new URL("../registry/schema.json", import.meta.url), "utf8"));
const entry = JSON.parse(await readFile(new URL("../registry/plugins/anti-ai-flavor.json", import.meta.url), "utf8"));

test("pending entries do not become recommended before licensing and compatibility are supplied", () => {
  validateEntry(schema, entry, "anti-ai-flavor.json");
  assert.throws(() => validateEntry(schema, { ...entry, status: "active" }, "anti-ai-flavor.json"));
  assert.throws(() => validateEntry(schema, { ...entry, maintainer: "official" }, "anti-ai-flavor.json"));
});
test("rejects unknown metadata and traversal refs", () => {
  assert.throws(() => validateEntry(schema, { ...entry, trust: "builtin" }, "anti-ai-flavor.json"));
  assert.throws(() => validateEntry(schema, { ...entry, ref: "../main" }, "anti-ai-flavor.json"));
});
test("untrusted labels cannot create HTML or extra table rows", () => {
  const table = renderTable([{ ...entry, name: "<img>|[link]\nextra" }]);
  assert.ok(!table.includes("<img>"));
  assert.equal(table.split("\n").length, 3);
  assert.ok(table.includes("&#124;"));
});
