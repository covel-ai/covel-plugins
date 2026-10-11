/**
 * @covel/plugin-openai-image-gen — image-generator handler
 *
 * Triggered by `openai-image.generate.requested` from the sibling
 * `prompt-generator` agent. Generation goes through the framework's unified
 * `ctx.images.generate()` pipeline: the kernel resolves the slot named by
 * `modelPresetId` (`[covel.<slot>]` in llm.toml), handles the HTTP call, SSRF
 * guard, response parsing and promptHash dedup, and persists the bytes into
 * MediaStore. Switching providers is an llm.toml edit, not a code change.
 *
 * The provider-agnostic trunk (prompt extraction, model availability check,
 * pending record, gallery fan-out, failure cards) is the SDK's
 * `runImageGeneration`, bundled in lib/covel-helpers.js; this file only
 * declares what is OpenAI-specific: the event topic, the default preset, the
 * `composition` prompt field, the size normalization, and the
 * style-into-prompt folding.
 *
 * Execution: `schedule.manual.execution: background` (RUNTIME.md). The host
 * runs it as a durable runtime job, which the `_jobs` panel data source shows.
 * The gallery re-renders on `plugin-data.changed` for the `images` namespace.
 */

import {
  optionalNumber,
  optionalString,
  runImageGeneration,
} from "../../lib/covel-helpers.js";

const DEFAULT_REQUEST_TIMEOUT_MS = 300000;

function normalizeImageSize(value) {
  // OpenAI Images API expects lowercase "1024x1024". The UI/help text may
  // contain the common DashScope-style "1024*1024"; normalize it so users do
  // not have to remember which provider wants which separator.
  return String(value ?? "1024x1024")
    .trim()
    .replace("*", "x")
    .toLowerCase();
}

/** @type {import("@covel/plugin-handlers-utils").PluginFunctionHandler} */
export default async function imageGeneratorHandler(ctx) {
  return runImageGeneration(ctx, {
    source: "openai-image-gen",
    triggerTopic: "openai-image.generate.requested",
    extraPromptFields: { composition: "single-scene" },
    planRequest(settings, { prompt }) {
      const style = optionalString(settings.style) ?? "";
      // Style has no dedicated wire parameter in ctx.images.generate — fold
      // it into the prompt text, same as any free-form prompt embellishment.
      const finalPrompt = style ? `${prompt}, style: ${style}` : prompt;
      const timeout = optionalNumber(settings.requestTimeoutMs);
      const n = optionalNumber(settings.n);
      return {
        prompt: finalPrompt,
        presetId: optionalString(settings.modelPresetId) ?? "openai-image",
        size: normalizeImageSize(optionalString(settings.imageSize)),
        n: n !== undefined && n >= 1 ? Math.floor(n) : 1,
        requestTimeoutMs:
          timeout !== undefined && timeout > 0
            ? Math.floor(timeout)
            : DEFAULT_REQUEST_TIMEOUT_MS,
        ...(optionalString(settings.quality)
          ? { quality: optionalString(settings.quality) }
          : {}),
      };
    },
  });
}
