import { describe, expect, it, vi } from "vitest";
import { tool, z } from "../../../test-support/toolkit.js";
import {
  getEmittedEvents,
  getPendingProposals,
  getToolContent,
} from "../lib/covel-helpers.js";
import makeSubmitImagePromptTools from "../tools/submit-image-prompt.js";

// The host's shortId (plugin SDK short-id.ts): the label's words plus eight hex
// digits, drawn from the context's random source when one is passed.
function shortId(prefix, label, _sessionId, random) {
  const slug = (label.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .join("-")
    .slice(0, 32)
    .replace(/-$/, "");
  const part = random
    ? random
        .int(0, 2 ** 32)
        .toString(16)
        .padStart(8, "0")
    : crypto.randomUUID().replaceAll("-", "").slice(0, 8);
  return [prefix, slug, part].filter(Boolean).join("-");
}

const context = {
  sessionId: "session-openai-image-prompt",
  turnId: "turn-openai-image-prompt",
  pluginId: "openai-image-gen",
  runtimeId: "openai-image-gen/prompt-generator",
  random: { int: vi.fn().mockReturnValue(0xabc) },
};

function toolsByName() {
  return new Map(
    makeSubmitImagePromptTools({ tool, z, shortId }).map((entry) => [
      entry.name,
      entry,
    ]),
  );
}

describe("OpenAI image prompt submission tools", () => {
  it("submits text with the OpenAI-specific event topic", async () => {
    const submit = toolsByName().get("submit-openai-image-text-prompt");
    const result = await submit.execute(
      { prompt: "  cinematic moonlit harbor  ", composition: "single-scene" },
      context,
    );

    expect(getToolContent(result)).toEqual({
      prompt: "cinematic moonlit harbor",
      promptMode: "text",
      composition: "single-scene",
    });
    expect(getEmittedEvents(result)).toEqual([
      {
        topic: "openai-image.generate.requested",
        data: {
          prompt: "cinematic moonlit harbor",
          promptMode: "text",
          composition: "single-scene",
        },
      },
    ]);
    expect(getPendingProposals(result)).toMatchObject([
      {
        type: "plugin.data",
        payload: {
          namespace: "prompts",
          key: expect.stringMatching(
            /^prompt-cinematic-moonlit-harbor-[a-f0-9]{8}$/,
          ),
          value: {
            prompt: "cinematic moonlit harbor",
            promptMode: "text",
            composition: "single-scene",
          },
        },
      },
    ]);
  });

  it("returns an explicit host tool result with a seeded prompt key", async () => {
    const submit = toolsByName().get("submit-openai-image-text-prompt");
    const result = await submit.execute(
      { prompt: "harbor", composition: "single-scene" },
      context,
    );

    expect(result.kind).toBe("covel.tool-result");
    // Every field is enumerable, so the result survives structuredClone.
    expect(getEmittedEvents(structuredClone(result))).toHaveLength(1);
    expect(getPendingProposals(result)[0].payload.key).toBe(
      "prompt-harbor-00000abc",
    );
  });

  it("serializes a structured prompt exactly once", async () => {
    const submit = toolsByName().get("submit-openai-image-structured-prompt");
    const prompt = {
      subject: { who: "旅人" },
      quality: ["4K", "masterpiece"],
    };
    const result = await submit.execute(
      { prompt, composition: "comic-strip" },
      context,
    );

    expect(getToolContent(result)).toEqual({
      prompt: JSON.stringify(prompt),
      promptMode: "image-json",
      composition: "comic-strip",
    });
    expect(getEmittedEvents(result)?.[0]?.data.prompt).toBe(
      JSON.stringify(prompt),
    );
  });

  it("rejects an empty structured prompt before emitting an event", async () => {
    const submit = toolsByName().get("submit-openai-image-structured-prompt");

    await expect(
      submit.execute({ prompt: {}, composition: "single-scene" }, context),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      details: expect.arrayContaining([
        expect.objectContaining({ path: "prompt" }),
      ]),
    });
  });
});
