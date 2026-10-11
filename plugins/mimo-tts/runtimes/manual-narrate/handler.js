/**
 * mimo-tts/manual-narrate — the Speak button's runtime.
 *
 * The button (ui/play-button.json) calls
 *   POST /api/sessions/:id/plugin-rpc
 *   { kind: "runtime", pluginId: "mimo-tts",
 *     runtimeId: "mimo-tts/manual-narrate", payload: { turnId, text } }
 * with `turnId` and `text` read from the turn's `message` record, which
 * auto-narrate writes. `payload.text` is required: a manual activation
 * resolves no turn input bindings, so there is no narrative to fall back to.
 *
 * `schedule.manual.execution: background` answers the request with a job ID
 * at once and runs this handler as a durable job; the right-panel tab picks
 * the new track up through `plugin-data.changed`. Speaking the same paragraph
 * again returns the stored track (`ctx.speech` promptHash dedup) instead of
 * calling the provider again.
 */

import {
  DEFAULT_PRESET_ID,
  DEFAULT_VOICE,
  TRACKS_NAMESPACE,
  clampText,
  hasSpeech,
  pickString,
  positiveInt,
  speechUnavailable,
  synthesizeTrack,
} from "../../lib/mimo-tts.js";

export default async function manualNarrateHandler(ctx) {
  const settings = ctx.userSettings ?? {};
  const payload = ctx.manualPayload ?? {};

  if (!hasSpeech(ctx)) return speechUnavailable();

  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  if (!text) {
    return {
      outcome: "skipped",
      skipReason:
        "payload.text is required: the Speak button sends the paragraph " +
        "text (manual activations carry no inputs)",
    };
  }

  const sourceTurnId = pickString(payload.turnId) ?? ctx.turnId;
  const trackId = `tts-manual-${sourceTurnId}-${Date.now().toString(36)}`;
  const result = await synthesizeTrack(ctx, {
    trackId,
    turnId: sourceTurnId,
    text: clampText(
      text,
      positiveInt(payload.maxChars ?? settings.maxChars, 1500),
    ),
    presetId:
      pickString(payload.modelPresetId, settings.modelPresetId) ??
      DEFAULT_PRESET_ID,
    voice: pickString(payload.voice, settings.voice) ?? DEFAULT_VOICE,
    format: (payload.format ?? settings.format) === "wav" ? "wav" : "mp3",
    timeoutMs: positiveInt(
      payload.requestTimeoutMs ?? settings.requestTimeoutMs,
      90_000,
    ),
    triggeredBy: "manual",
  });

  const trackEntry = {
    namespace: TRACKS_NAMESPACE,
    key: trackId,
    value: result.record,
  };
  if (!result.ok) {
    return {
      outcome: "success",
      value: { trackId, status: "failed", error: result.error },
      effects: { pluginData: [trackEntry] },
    };
  }
  return {
    outcome: "success",
    value: { trackId, status: "done", ref: result.record.ref },
    effects: {
      pluginData: [trackEntry],
      assetGenerations: [result.asset],
    },
  };
}
