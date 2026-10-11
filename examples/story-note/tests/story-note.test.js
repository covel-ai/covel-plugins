import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import register, { addStoryNote, noteFor } from "../server/index.js";

test("registers the public hook and modifies only story prompts", () => {
  const hooks = new Map();
  register({
    on: (event, handler, options) => hooks.set(event, { handler, options }),
  });
  assert.deepEqual([...hooks.keys()], ["PostContextAssembly"]);
  assert.equal(hooks.get("PostContextAssembly").handler, addStoryNote);
  assert.equal(hooks.get("PostContextAssembly").options.enforce, "normal");
  const payload = { outputKind: "story", systemPrompt: "Original" };
  const result = addStoryNote({ locale: "en-US" }, payload);
  assert.equal(result.action, "continue");
  assert.equal(
    result.replace.systemPrompt,
    "Original\n\nLeave room for the player to decide the next action.",
  );
  assert.equal(payload.systemPrompt, "Original");
  assert.deepEqual(
    addStoryNote({ locale: "en-US" }, { ...payload, outputKind: "plugin" }),
    { action: "continue" },
  );
});

test("writes the note in the session's instruction language", () => {
  assert.equal(noteFor("zh-CN"), "给玩家留出决定下一步行动的空间。");
  assert.equal(noteFor("zh"), "给玩家留出决定下一步行动的空间。");
  for (const locale of ["zh-TW", "zh-Hant", "ru-RU", undefined, "not a locale"])
    assert.equal(
      noteFor(locale),
      "Leave room for the player to decide the next action.",
    );
});

test("the manifest declares the hook it registers", async () => {
  const manifest = await readFile(
    new URL("../PLUGIN.md", import.meta.url),
    "utf8",
  );
  assert.match(manifest, /^id: story-note$/m);
  assert.match(manifest, /- event: PostContextAssembly\n\s+enforce: normal/);
});
