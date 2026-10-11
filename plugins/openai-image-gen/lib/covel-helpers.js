// Pure Covel 0.0.50 helpers (MIT, Covel Contributors). See LICENSE and lib/README.md.
// Sources: packages/plugin-handlers-utils/src/{index,image-generation,tool-result}.ts

export function optionalString(value) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}
export function optionalNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || value.trim().length === 0) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
export function abortSignalWithTimeout(signal, timeoutMs) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}
export function makeProposal(ctx, now, type, payload) {
  return {
    id: crypto.randomUUID(),
    type,
    source: {
      pluginId: ctx.pluginId,
      runtimeId: ctx.runtimeId ?? ctx.pluginId,
    },
    turnId: ctx.turnId,
    sessionId: ctx.sessionId,
    payload,
    timestamp: now,
  };
}

// ── image generation (image-generation.ts) ───────────────────────

const IMAGES_NAMESPACE = "images";
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}
function readPromptPayload(payload, extraPromptFields) {
  const rec = asRecord(payload);
  const prompt = rec ? optionalString(rec.prompt) : undefined;
  if (!rec || !prompt) return null;
  const extras = {};
  for (const [field, fallback] of Object.entries(extraPromptFields)) {
    extras[field] = optionalString(rec[field]) ?? fallback;
  }
  return {
    prompt,
    promptMode: optionalString(rec.promptMode) ?? "text",
    extras,
  };
}
export function extractImagePrompt(ctx, config) {
  const extraFields = config.extraPromptFields ?? {};
  const trigger = asRecord(ctx.triggerEvent);
  if (trigger && trigger.topic === config.triggerTopic) {
    const fromEvent = readPromptPayload(trigger.data, extraFields);
    if (fromEvent) return fromEvent;
  }
  return readPromptPayload(ctx.manualPayload, extraFields);
}
function imageRecordKey(imageId, idx) {
  return idx === 0 ? imageId : `${imageId}-${idx + 1}`;
}
function errorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}
async function failureRecord(ctx, baseRecord, message) {
  const record = {
    ...baseRecord,
    status: "failed",
    error: message,
    completedAt: new Date().toISOString(),
  };
  await ctx.pluginData?.set(IMAGES_NAMESPACE, baseRecord.imageId, record);
  await ctx.logger?.error?.("image.generate.failed", {
    imageId: baseRecord.imageId,
    error: message,
  });
  return {
    outcome: "success",
    value: {
      imageId: baseRecord.imageId,
      status: "failed",
      error: message,
      prompt: baseRecord.prompt,
      promptMode: baseRecord.promptMode,
    },
    effects: {
      pluginData: [
        { namespace: IMAGES_NAMESPACE, key: baseRecord.imageId, value: record },
      ],
    },
  };
}
export async function runImageGeneration(ctx, config) {
  const extracted = extractImagePrompt(ctx, config);
  if (!extracted) {
    await ctx.logger?.warn?.("no-prompt-found", {
      hasTriggerEvent: !!ctx.triggerEvent,
    });
    return {
      outcome: "skipped",
      skipReason: `No image prompt found in ctx.triggerEvent or ctx.manualPayload. Did prompt-generator emit events[0].data.prompt with topic ${config.triggerTopic}?`,
    };
  }
  const settings = asRecord(ctx.userSettings) ?? {};
  const plan = config.planRequest(settings, extracted);
  const { prompt } = plan;
  const { promptMode, extras } = extracted;
  // Check the named model before writing a pending gallery record.
  if (!ctx.images?.isAvailable(plan.presetId)) {
    return { outcome: "skipped", skipReason: "image model unavailable" };
  }
  const suffix = ctx.random
    ? ctx.random
        .int(0, 36 ** 6)
        .toString(36)
        .padStart(6, "0")
    : Math.random().toString(36).slice(2, 8);
  const imageId = `img-${Date.now().toString(36)}-${suffix}`;
  const startedAt = new Date().toISOString();
  const baseRecord = {
    imageId,
    prompt,
    promptMode,
    ...extras,
    ...(ctx.turnId ? { turnId: ctx.turnId } : {}),
    presetId: plan.presetId,
    imageSize: plan.size,
    n: plan.n,
    requestTimeoutMs: plan.requestTimeoutMs,
    ...plan.recordFields,
    startedAt,
  };
  // Pre-write a pending placeholder so the gallery can spin while we wait.
  await ctx.pluginData?.set(IMAGES_NAMESPACE, imageId, {
    ...baseRecord,
    status: "pending",
  });
  await ctx.logger?.info?.("image.generate.started", {
    imageId,
    presetId: plan.presetId,
    imageSize: plan.size,
    n: plan.n,
    requestTimeoutMs: plan.requestTimeoutMs,
    ...(plan.quality !== undefined ? { quality: plan.quality } : {}),
  });
  try {
    const { refs, warnings, cached } = await ctx.images.generate({
      presetId: plan.presetId,
      prompt,
      size: plan.size,
      n: plan.n,
      quality: plan.quality || undefined,
      negativePrompt: plan.negativePrompt || undefined,
      signal: abortSignalWithTimeout(ctx.signal, plan.requestTimeoutMs),
      metadata: { source: config.source, turnId: ctx.turnId },
    });
    if (refs.length === 0) {
      return failureRecord(
        ctx,
        baseRecord,
        `Provider returned no images.${warnings.length > 0 ? ` Warnings: ${warnings.join("; ")}` : ""}`,
      );
    }
    const completedAt = new Date().toISOString();
    const imageRecords = refs.map((ref, idx) => ({
      key: imageRecordKey(imageId, idx),
      value: {
        ...baseRecord,
        imageId: imageRecordKey(imageId, idx),
        batchId: imageId,
        imageIndex: idx,
        imageCount: refs.length,
        status: "done",
        ref,
        ...(cached ? { cached: true } : {}),
        ...(warnings.length > 0 ? { warnings } : {}),
        completedAt,
        durationMs: Date.parse(completedAt) - Date.parse(startedAt),
      },
    }));
    // meta.prompt is the line the story model reads where the picture appears.
    const assets = refs.map((ref, imageIndex) => ({
      ref,
      modality: "image",
      meta: {
        prompt,
        imageSize: plan.size,
        imageId,
        imageIndex,
        mime: ref.mime,
        byteSize: ref.size,
      },
    }));
    await ctx.logger?.info?.("image.generate.completed", {
      imageId,
      durationMs: imageRecords[0].value.durationMs,
      imageCount: refs.length,
      cached,
      ...(warnings.length > 0 ? { warnings } : {}),
    });
    return {
      outcome: "success",
      value: {
        imageId,
        status: "done",
        ref: refs[0],
        ...(refs.length > 1 ? { refs } : {}),
        ...(warnings.length > 0 ? { warnings } : {}),
        ...(cached ? { cached: true } : {}),
        prompt,
        promptMode,
        ...extras,
      },
      effects: {
        pluginData: imageRecords.map((entry) => ({
          namespace: IMAGES_NAMESPACE,
          key: entry.key,
          value: entry.value,
        })),
        assetGenerations: assets,
      },
    };
  } catch (err) {
    return failureRecord(ctx, baseRecord, errorMessage(err));
  }
}

// ── tool results (tool-result.ts) ────────────────────────────────
// A tool result is an explicit, enumerable object the host recognizes by
// `kind: "covel.tool-result"`; it survives spread, structuredClone and JSON.

function isToolResult(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    "kind" in value &&
    value.kind === "covel.tool-result"
  );
}
export function withPendingProposals(content, pendingProposals) {
  const emittedEvents = getEmittedEvents(content);
  return {
    kind: "covel.tool-result",
    content: getToolContent(content),
    pendingProposals: [...pendingProposals],
    ...(emittedEvents ? { emittedEvents: [...emittedEvents] } : {}),
  };
}
export function withEmittedEvents(content, emittedEvents) {
  return {
    kind: "covel.tool-result",
    content: getToolContent(content),
    pendingProposals: [...getPendingProposals(content)],
    emittedEvents: [...emittedEvents],
  };
}
export function getToolContent(value) {
  return isToolResult(value) ? value.content : value;
}
export function getPendingProposals(value) {
  return isToolResult(value) ? value.pendingProposals : [];
}
export function getEmittedEvents(value) {
  return isToolResult(value) ? value.emittedEvents : undefined;
}
