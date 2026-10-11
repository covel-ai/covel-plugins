/**
 * Shared narration helpers of the two runtimes.
 *
 * The MiMo HTTP wire lives in ./wires.js; server/index.js registers it with
 * `covel.registerWires()`. The handlers call `ctx.speech.generate()`, and the
 * host does slot resolution, wire dispatch, MediaStore persistence and
 * promptHash dedup. This module builds the `tracks` records the right-panel
 * tab binds against and the `asset.generate` entry of a new track. Every
 * write leaves the handler as `HandlerResult.effects`; nothing is written
 * directly.
 */

import { labelText, translate } from "./i18n.js";

export const TRACKS_NAMESPACE = "tracks";
export const MESSAGE_NAMESPACE = "message";
export const DEFAULT_PRESET_ID = "mimo-tts";
export const DEFAULT_VOICE = "mimo_default";

/** Whether the host gave this runtime the speech pipeline. */
export function hasSpeech(ctx) {
  return Boolean(ctx.speech) && typeof ctx.speech.generate === "function";
}

/** The `failed` result for a host without `ctx.speech`. */
export function speechUnavailable() {
  return {
    outcome: "failed",
    error:
      "ctx.speech is unavailable: this Covel host gives function runtimes no speech pipeline (Covel >=0.0.50 is required).",
  };
}

/**
 * Bound speech work by a timeout while preserving player turn cancellation.
 * @param {AbortSignal | undefined} signal
 * @param {number} timeoutMs
 */
export function abortSignalWithTimeout(signal, timeoutMs) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

/** A positive integer from a setting or payload value, else `fallback`. */
export function positiveInt(value, fallback) {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : fallback;
}

/** The first non-blank string among `candidates`, trimmed. */
export function pickString(...candidates) {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return undefined;
}

/** Shorten `text` to `maxChars`, marking the cut with an ellipsis. */
export function clampText(text, maxChars) {
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}

/**
 * The active narrative engine's `narrativeOutput`, bound by the
 * `io.inputs.narrative` declaration (`ctx.inputs.narrative.value`, after
 * `select: /narrativeOutput`). The binding resolves the provider of
 * `narrative-engine@1`, so it works for narrator and chat-mode-narrator
 * alike. A manual activation resolves no turn bindings, so manual-narrate
 * takes its text from the Speak button payload instead.
 */
export function pickNarratorText(ctx) {
  const slot = ctx.inputs?.narrative;
  const value = slot && typeof slot === "object" ? slot.value : undefined;
  // The binding selects `/narrativeOutput` (a string); accept an object with
  // `narrativeOutput` or `content` too, in case a provider projects one.
  const candidate =
    typeof value === "string"
      ? value
      : value && typeof value === "object"
        ? typeof value.narrativeOutput === "string"
          ? value.narrativeOutput
          : typeof value.content === "string"
            ? value.content
            : null
        : null;
  if (!candidate) return null;
  const trimmed = candidate.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Display fields the right-panel spec binds against, the same for auto,
 * manual and failed tracks. `triggerLabel` is a badge only the client draws,
 * so it carries every shipped language (`labelText`).
 *
 * @param {object} ctx
 * @param {{ turnId?: string, triggeredBy: 'auto'|'manual', text: string, byteSize?: number }} args
 */
export function deriveDisplayFields(ctx, args) {
  const { turnId, triggeredBy, text, byteSize } = args;
  return {
    turnLabel: translate(ctx, "Turn {turn}", { turn: shortTurnTail(turnId) }),
    triggerLabel:
      triggeredBy === "auto"
        ? labelText(ctx, "AUTO")
        : labelText(ctx, "MANUAL"),
    textPreview: previewLine(text),
    sizeLabel: typeof byteSize === "number" ? formatBytes(byteSize) : "",
  };
}

function shortTurnTail(turnId) {
  if (!turnId) return "?";
  // Turn IDs are UUIDs or `turn-<n>`: keep the last 6 characters of a long
  // one so the header row stays compact.
  return turnId.length > 8 ? turnId.slice(-6) : turnId.replace(/^turn-/, "");
}

function previewLine(text) {
  // The tab is a playlist: the story text is already in the chat, so one
  // short identifying line (~40 characters) per track is enough.
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > 40 ? `${oneLine.slice(0, 39)}…` : oneLine;
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Synthesize one track through `ctx.speech.generate()`.
 *
 * Returns `{ ok: true, record, asset }` on success: `record` is the `tracks`
 * value, `asset` the `effects.assetGenerations[]` entry the kernel turns
 * into an `asset.generate` proposal. Returns `{ ok: false, record, error }`
 * when synthesis fails; `record` is then the `failed` track.
 *
 * @param {object} ctx  the handler context
 * @param {{
 *   trackId: string, turnId: string, text: string, presetId: string,
 *   voice: string, format: 'mp3'|'wav', timeoutMs: number,
 *   triggeredBy: 'auto'|'manual',
 * }} job
 */
export async function synthesizeTrack(ctx, job) {
  const { trackId, turnId, text, presetId, voice, format, triggeredBy } = job;
  const logger = ctx.logger;
  // Display only: the slot decides the actual model.
  const model =
    ctx.gateway?.resolveSlot?.({ presetId, fallbackTag: "speech" })?.model ??
    presetId;
  const startedAt = new Date().toISOString();
  const base = {
    trackId,
    turnId,
    text,
    textLen: text.length,
    model,
    voice,
    format,
    triggeredBy,
    presetId,
    startedAt,
  };
  await logger?.info?.("mimo-tts.started", {
    trackId,
    turnId,
    triggeredBy,
    presetId,
    voice,
    format,
  });

  try {
    const { refs, cached } = await ctx.speech.generate({
      presetId,
      text,
      voice,
      format,
      metadata: {
        plugin: "mimo-tts",
        turnId,
        model,
        voice,
        format,
        triggeredBy,
      },
      signal: abortSignalWithTimeout(ctx.signal, job.timeoutMs),
    });
    const ref = refs[0];
    if (!ref) throw new Error("speech provider returned no usable media");

    const completedAt = new Date().toISOString();
    const record = {
      ...base,
      status: "done",
      completedAt,
      durationMs: Date.parse(completedAt) - Date.parse(startedAt),
      ref,
      cached,
      autoPlay: triggeredBy === "auto" && !cached,
      ...deriveDisplayFields(ctx, {
        turnId,
        triggeredBy,
        text,
        byteSize: ref.size,
      }),
    };
    await logger?.info?.("mimo-tts.completed", {
      trackId,
      turnId,
      triggeredBy,
      bytes: ref.size,
      cached,
      durationMs: record.durationMs,
    });
    return {
      ok: true,
      record,
      asset: {
        ref,
        modality: "audio",
        meta: {
          plugin: "mimo-tts",
          turnId,
          model,
          voice,
          format,
          mime: ref.mime,
          byteSize: ref.size,
        },
      },
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const record = {
      ...base,
      status: "failed",
      error,
      completedAt: new Date().toISOString(),
      ...deriveDisplayFields(ctx, { turnId, triggeredBy, text }),
    };
    await logger?.error?.("mimo-tts.failed", { trackId, error });
    return { ok: false, record, error };
  }
}
