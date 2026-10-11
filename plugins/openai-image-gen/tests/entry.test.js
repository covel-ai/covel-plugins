// The entry's registrations must match the root PLUGIN.md `contributes` in
// both directions, or the host refuses to load the package. This drives the
// entry against a recording stand-in for the host's PluginAPI.
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { tool, z } from "../../../test-support/toolkit.js";
import entry from "../server/index.js";

const PLUGIN_ID = "openai-image-gen";
const TOOLS = [
  "submit-openai-image-text-prompt",
  "submit-openai-image-structured-prompt",
];

async function register() {
  const tools = [];
  const extensions = [];
  await entry({
    pluginId: PLUGIN_ID,
    signal: new AbortController().signal,
    toolkit: { tool, z, shortId: () => "id" },
    registerTool: (module) => tools.push(module),
    provideExtension: (point, id, definition) =>
      extensions.push({ point, id, definition }),
    onDispose: () => {},
  });
  return { tools, extensions };
}

describe("${PLUGIN_ID} entry", () => {
  it("registers exactly the tools PLUGIN.md contributes", async () => {
    const { tools } = await register();
    expect(tools.map((module) => module.name).sort()).toEqual(
      [...TOOLS].sort(),
    );
    for (const module of tools) expect(module._type).toBe("covel-tool");

    const manifest = await readFile(
      new URL("../PLUGIN.md", import.meta.url),
      "utf8",
    );
    const contributed = manifest.match(/^ {2}tools:\n((?: {4}- .+\n)+)/m);
    expect(
      contributed?.[1].match(/- (.+)/g)?.map((line) => line.slice(2)),
    ).toEqual(TOOLS);
  });

  it("declares its own prompt and asset runtimes through media.image-flow@1", async () => {
    const { extensions } = await register();
    expect(extensions.map(({ point, id }) => ({ point, id }))).toEqual([
      { point: "media.image-flow@1", id: "flow" },
    ]);
    const flow = await extensions[0].definition.handler({}, {});
    expect(flow).toEqual({
      entryRuntimeId: `${PLUGIN_ID}/prompt-generator`,
      assetRuntimeIds: [`${PLUGIN_ID}/image-generator`],
    });
    // The host only accepts runtime IDs of the providing plugin.
    for (const id of [flow.entryRuntimeId, ...flow.assetRuntimeIds])
      expect(id.startsWith(`${PLUGIN_ID}/`)).toBe(true);
  });
});
