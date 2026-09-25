import { test } from "node:test";
import assert from "node:assert/strict";
import register, { addStoryNote } from "../server/index.js";

test("registers the public hook and modifies only story prompts", () => {
  const hooks = new Map();
  register({ on: (event, handler) => hooks.set(event, handler) });
  assert.equal(hooks.get("PostContextAssembly"), addStoryNote);
  const payload = { outputKind: "story", systemPrompt: "Original", locale: "en-US" };
  const result = addStoryNote({}, payload);
  assert.equal(result.action, "continue");
  assert.ok(result.replace.systemPrompt.startsWith("Original\n\n"));
  assert.equal(payload.systemPrompt, "Original");
  assert.deepEqual(addStoryNote({}, { ...payload, outputKind: "plugin" }), { action: "continue" });
});
