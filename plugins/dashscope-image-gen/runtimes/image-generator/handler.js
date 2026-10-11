/**
 * @covel/plugin-dashscope-image-gen — image-generator handler
 *
 * Triggered by the `image.generate.requested` event from the sibling
 * `prompt-generator` agent. Generation goes through the framework's unified
 * `ctx.images.generate()` pipeline: the kernel resolves the slot named by
 * `modelPresetId` (`[covel.<slot>]` in llm.toml, with
 * `providerRequestMetadata.imageWire = "dashscope-wan"`), and that wire handles
 * the DashScope wan2.x async task (submit + poll), the `x`→`*` size-separator
 * conversion, per-model negative_prompt / `n` handling, SSRF/redirect guarding,
 * and OSS URL ingestion into the framework MediaStore.
 *
 * The provider-agnostic trunk (prompt extraction, model availability check,
 * pending record, gallery fan-out, failure cards) is the SDK's
 * `runImageGeneration`, bundled in lib/covel-helpers.js; this file only
 * declares what is DashScope-specific: the event topic, the default preset,
 * and the settings mapping (negativePrompt passthrough + quality display
 * field).
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

/** @type {import("@covel/plugin-handlers-utils").PluginFunctionHandler} */
export default async function imageGeneratorHandler(ctx) {
  return runImageGeneration(ctx, {
    source: "dashscope-image-gen",
    triggerTopic: "image.generate.requested",
    planRequest(settings, { prompt }) {
      const quality = optionalString(settings.quality) ?? "low";
      const negativePrompt =
        typeof settings.negativePrompt === "string"
          ? settings.negativePrompt
          : "";
      const timeout = optionalNumber(settings.requestTimeoutMs);
      const n = optionalNumber(settings.n);
      return {
        prompt,
        presetId: optionalString(settings.modelPresetId) ?? "image",
        size: optionalString(settings.imageSize) ?? "1024x1024",
        n: n !== undefined && n >= 1 ? Math.floor(n) : 1,
        requestTimeoutMs:
          timeout !== undefined && timeout > 0
            ? timeout
            : DEFAULT_REQUEST_TIMEOUT_MS,
        quality,
        ...(negativePrompt ? { negativePrompt } : {}),
        // quality is display-only for wan2.x; keep it on the gallery record.
        recordFields: { quality },
      };
    },
  });
}
