import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { cleanNote } from "../server/format.js";
import register from "../server/index.js";

test("cleans whitespace and line endings while preserving paragraphs", () => {
  assert.equal(
    cleanNote(
      "  First line  \r\n next line\t\r\n\r\n\r\n Second paragraph  \r",
    ),
    "First line\nnext line\n\nSecond paragraph",
  );
});

test("returns markup as literal text without interpreting it", () => {
  assert.equal(
    cleanNote("  <script>alert(1)</script>  "),
    "<script>alert(1)</script>",
  );
});

test("the entry registers format-note under the declared service contract", async () => {
  // A schema stand-in: the host's toolkit supplies real Zod schemas.
  const schema = () => new Proxy({}, { get: () => () => schema() });
  const services = [];
  register({
    toolkit: { z: { object: schema, string: schema } },
    registerService: (definition) => services.push(definition),
  });
  assert.equal(services.length, 1);
  const [service] = services;
  assert.equal(service.name, "format-note");
  assert.equal(service.contract, "examples.note-format@1");
  const manifest = await readFile(
    new URL("../PLUGIN.md", import.meta.url),
    "utf8",
  );
  assert.match(manifest, /services:\n {4}- examples\.note-format@1\n/);
  const result = service.handler(
    { text: " One \n\n\n Two " },
    { signal: new AbortController().signal },
  );
  assert.equal(typeof result.text, "string");
  const controller = new AbortController();
  controller.abort();
  assert.throws(() =>
    service.handler({ text: "One" }, { signal: controller.signal }),
  );
});
