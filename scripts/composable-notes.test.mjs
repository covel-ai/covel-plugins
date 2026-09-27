import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";

import registerClean from "../examples/note-format-clean/server/index.js";
import registerOutline from "../examples/note-format-outline/server/index.js";

for (const [name, register] of [
  ["clean", registerClean],
  ["outline", registerOutline],
]) {
  test(`${name} registers the versioned, bounded service and honors cancellation`, () => {
    let service;
    register({
      toolkit: { z },
      registerService(definition) {
        service = definition;
      },
    });
    assert.equal(service.name, "format-note");
    assert.equal(service.contract, "examples/note-format@1");
    assert.ok(service.description);
    assert.throws(() => service.input.parse({ text: "   " }));
    assert.throws(() => service.input.parse({ text: "x".repeat(4001) }));
    assert.throws(() => service.output.parse({ text: " " }));
    assert.throws(() => service.output.parse({ text: "x".repeat(8001) }));

    const input = service.input.parse({ text: "  First  \n\n Second  " });
    const result = service.handler(input, {
      signal: new AbortController().signal,
    });
    assert.ok(service.output.parse(result).text);

    const controller = new AbortController();
    controller.abort();
    assert.throws(() =>
      service.handler(input, { signal: controller.signal }),
    );
  });
}
