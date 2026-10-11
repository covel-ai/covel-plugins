/**
 * mimo-tts/auto-narrate — runs after the active narrative engine succeeded
 * (`schedule.needs: narrative-engine@1`), as a detached post-turn job.
 *
 * It reads the turn's `narrativeOutput` from the `narrative` input binding.
 * Every turn, even with auto synthesis off, it records `{ turnId, text }` in
 * the `message` namespace: the message layer renders the Speak button
 * (manual-narrate) only under a turn that has this record, and the button
 * reads `/turnId` and `/text` from it as its payload. With auto synthesis on
 * it also synthesizes the text through `ctx.speech.generate()` and stores the
 * track in `tracks`; a failed synthesis is stored as a `failed` track, so the
 * result is still a success and the Speak button still appears.
 */

import {
  DEFAULT_PRESET_ID,
  DEFAULT_VOICE,
  MESSAGE_NAMESPACE,
  TRACKS_NAMESPACE,
  clampText,
  hasSpeech,
  pickNarratorText,
  pickString,
  positiveInt,
  speechUnavailable,
  synthesizeTrack,
} from "../../lib/mimo-tts.js";

export default async function autoNarrateHandler(ctx) {
  const { turnId } = ctx;
  const settings = ctx.userSettings ?? {};

  const text = pickNarratorText(ctx);
  if (!text) {
    return {
      outcome: "skipped",
      skipReason: "the narrative engine produced no narrativeOutput",
    };
  }

  const messageEntry = {
    namespace: MESSAGE_NAMESPACE,
    key: turnId,
    value: { turnId, text },
  };

  if (settings.enabled === false) {
    // The Speak-button record is this run's whole work; it needs no speech
    // pipeline, so this check comes before the pipeline probe.
    return {
      outcome: "success",
      value: { autoSynthesis: "disabled-by-user-setting" },
      effects: { pluginData: [messageEntry] },
    };
  }

  if (!hasSpeech(ctx)) return speechUnavailable();

  const trackId = `tts-auto-${turnId}`;
  const result = await synthesizeTrack(ctx, {
    trackId,
    turnId,
    text: clampText(text, positiveInt(settings.maxChars, 1500)),
    presetId: pickString(settings.modelPresetId) ?? DEFAULT_PRESET_ID,
    voice: pickString(settings.voice) ?? DEFAULT_VOICE,
    format: settings.format === "wav" ? "wav" : "mp3",
    timeoutMs: positiveInt(settings.requestTimeoutMs, 90_000),
    triggeredBy: "auto",
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
      effects: { pluginData: [trackEntry, messageEntry] },
    };
  }
  return {
    outcome: "success",
    value: { trackId, status: "done", ref: result.record.ref },
    effects: {
      pluginData: [trackEntry, messageEntry],
      assetGenerations: [result.asset],
    },
  };
}
