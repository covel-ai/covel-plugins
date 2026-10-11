import { randomUUID } from "node:crypto";
import { CONTRACT, SERVICE_NAME } from "../../lib/contract.js";
import { translate } from "../../lib/text.js";

export default async function save(ctx) {
  const payload = ctx.manualPayload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(translate(ctx, "Enter note text."));
  }
  const originalText = payload.text;
  if (
    typeof originalText !== "string" ||
    !originalText.trim() ||
    originalText.length > 4000
  ) {
    throw new Error(
      translate(
        ctx,
        "Note text must contain nonblank text and be at most 4000 characters.",
      ),
    );
  }

  const selected = payload.providerPluginId;
  if (selected !== undefined && typeof selected !== "string") {
    throw new Error(translate(ctx, "Invalid formatter plugin ID."));
  }
  const providerPluginId = selected?.trim() || null;
  let text = originalText;
  if (providerPluginId !== null) {
    const providers = await ctx.services.discover(CONTRACT);
    if (
      !providers.some(
        (service) =>
          service.pluginId === providerPluginId &&
          service.name === SERVICE_NAME,
      )
    ) {
      throw new Error(
        translate(ctx, "The selected note formatter is unavailable."),
      );
    }
    let result;
    try {
      result = await ctx.services.call(
        {
          pluginId: providerPluginId,
          name: SERVICE_NAME,
          contract: CONTRACT,
          input: { text: originalText },
        },
        { timeoutMs: 1500, signal: ctx.signal },
      );
    } catch {
      throw new Error(
        translate(
          ctx,
          "Note formatting failed. Retry or save the original text.",
        ),
      );
    }
    text = result?.text;
    if (typeof text !== "string" || !text.trim() || text.length > 8000) {
      throw new Error(
        translate(
          ctx,
          "The formatted note is blank, invalid, or exceeds 8000 characters.",
        ),
      );
    }
  }

  // The note ID and time are bookkeeping, not game randomness: no model reads
  // them, so they need not come from `ctx.random`.
  const note = {
    id: randomUUID(),
    originalText,
    text,
    providerPluginId,
    createdAt: new Date().toISOString(),
  };
  await ctx.pluginData.set("notes", note.id, note);
  return { outcome: "success", value: { note } };
}
