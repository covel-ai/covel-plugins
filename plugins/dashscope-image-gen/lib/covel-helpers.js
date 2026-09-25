// Pure Covel 0.0.39 helpers (MIT, Covel Contributors). See LICENSE and lib/README.md.

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
const IMAGES_NAMESPACE = "images";
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}
function readPromptPayload(payload, extraPromptFields) {
  const rec = asRecord(payload);
  const prompt = rec ? optionalString(rec.prompt) : void 0;
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
function extractImagePrompt(ctx, config) {
  const extraFields = config.extraPromptFields ?? {};
  const trigger = asRecord(ctx.triggerEvent);
  if (trigger && trigger.topic === config.triggerTopic) {
    const fromEvent = readPromptPayload(trigger.data, extraFields);
    if (fromEvent) return fromEvent;
  }
  return readPromptPayload(ctx.manualPayload, extraFields);
}
function imageRecordKey(imageId, refs, idx) {
  return refs.length === 1 ? imageId : `${imageId}-${idx + 1}`;
}
function errorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}
async function failureRecord(ctx, baseRecord, message) {
  const record = {
    ...baseRecord,
    status: "failed",
    error: message,
    completedAt: /* @__PURE__ */ new Date().toISOString(),
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
async function runImageGeneration(ctx, config) {
  if (!ctx.images) {
    return {
      outcome: "failed",
      error:
        'ctx.images is unavailable. This plugin requires the framework image pipeline: an image-tagged slot in llm.toml plus a configured MediaStore. Upgrade @covel/server / @covel/runtime and add a [covel.<slot>] block with tag = "image".',
    };
  }
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
  const imageId = `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = /* @__PURE__ */ new Date().toISOString();
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
    ...(plan.quality !== void 0 ? { quality: plan.quality } : {}),
  });
  try {
    const { refs, warnings, cached } = await ctx.images.generate({
      presetId: plan.presetId,
      prompt,
      size: plan.size,
      n: plan.n,
      quality: plan.quality || void 0,
      negativePrompt: plan.negativePrompt || void 0,
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
    const completedAt = /* @__PURE__ */ new Date().toISOString();
    const imageRecords = refs.map((ref, idx) => ({
      key: imageRecordKey(imageId, refs, idx),
      value: {
        ...baseRecord,
        imageId: imageRecordKey(imageId, refs, idx),
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
export { extractImagePrompt, runImageGeneration };
const TOOL_PENDING_PROPOSALS = /* @__PURE__ */ Symbol.for(
  "covel.tools.pendingProposals",
);
const TOOL_EMITTED_EVENTS = /* @__PURE__ */ Symbol.for(
  "covel.tools.emittedEvents",
);
const TOOL_EXECUTION_ENVELOPE = /* @__PURE__ */ Symbol.for(
  "covel.tools.executionEnvelope",
);
function withPendingProposals(content, pendingProposals) {
  if (pendingProposals.length === 0) {
    return content;
  }
  const copied = [...pendingProposals];
  if (content !== null && typeof content === "object") {
    try {
      Object.defineProperty(content, TOOL_PENDING_PROPOSALS, {
        value: copied,
        enumerable: false,
        configurable: true,
        writable: true,
      });
      return content;
    } catch {}
  }
  const envelope = {
    content,
    pendingProposals: copied,
  };
  Object.defineProperty(envelope, TOOL_EXECUTION_ENVELOPE, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return envelope;
}
function isExecutionEnvelope(value) {
  return (
    !!value &&
    typeof value === "object" &&
    value[TOOL_EXECUTION_ENVELOPE] === true
  );
}
function getToolContent(value) {
  return isExecutionEnvelope(value) ? value.content : value;
}
function getPendingProposals(value) {
  if (isExecutionEnvelope(value)) {
    return value.pendingProposals ?? [];
  }
  if (value !== null && typeof value === "object") {
    const proposals = value[TOOL_PENDING_PROPOSALS];
    if (Array.isArray(proposals)) {
      return proposals;
    }
  }
  return [];
}
function withEmittedEvents(content, events) {
  if (events.length === 0) {
    return content;
  }
  const copied = [...events];
  if (content !== null && typeof content === "object") {
    try {
      Object.defineProperty(content, TOOL_EMITTED_EVENTS, {
        value: copied,
        enumerable: false,
        configurable: true,
        writable: true,
      });
      return content;
    } catch {}
  }
  const envelope = {
    content,
    emittedEvents: copied,
  };
  Object.defineProperty(envelope, TOOL_EXECUTION_ENVELOPE, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return envelope;
}
function getEmittedEvents(value) {
  if (isExecutionEnvelope(value)) {
    return value.emittedEvents;
  }
  if (value !== null && typeof value === "object") {
    const events = value[TOOL_EMITTED_EVENTS];
    if (Array.isArray(events)) {
      return events;
    }
  }
  return void 0;
}
export {
  getEmittedEvents,
  getPendingProposals,
  getToolContent,
  withEmittedEvents,
  withPendingProposals,
};
