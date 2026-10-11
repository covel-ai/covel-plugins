import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { outlineNote } from "../server/format.js";
import register from "../server/index.js";

test("creates one bullet per nonblank line without duplicate prefixes", () => {
  assert.equal(
    outlineNote(" First \r\n\r\n * Second\r• Third\n1. Fourth\n- 第五项 "),
    "- First\n- Second\n- Third\n- Fourth\n- 第五项",
  );
});

test("keeps punctuation and HTML-like content as literal text", () => {
  assert.equal(
    outlineNote("-dash\n<script>hi</script>"),
    "- -dash\n- <script>hi</script>",
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
