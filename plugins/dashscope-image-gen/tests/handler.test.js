// Unit tests for runtimes/image-generator/handler.js.
//
// The handler is a pure function of its FunctionHandlerContext, so these
// tests import it directly and hand it a bare mock ctx — no framework
// runtime needed.
import { describe, expect, it, vi } from "vitest";
import handler from "../runtimes/image-generator/handler.js";

const TOPIC = "image.generate.requested";

function makeRef(id = "media-1") {
  return { id, mime: "image/png", size: 1024 };
}

// ImagesContext as the host provides it: isAvailable() is a required member.
function makeImages(
  result = { refs: [makeRef()], warnings: [], cached: false },
) {
  return {
    isAvailable: vi.fn().mockReturnValue(true),
    generate:
      result instanceof Error
        ? vi.fn().mockRejectedValue(result)
        : vi.fn().mockResolvedValue(result),
  };
}

function makeCtx(overrides = {}) {
  return {
    turnId: "turn-1",
    triggerEvent: {
      topic: TOPIC,
      data: { prompt: "a koi pond at dusk", promptMode: "text" },
    },
    userSettings: {},
    pluginData: { set: vi.fn() },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    images: makeImages(),
    ...overrides,
  };
}

describe("image-generator handler", () => {
  it("skips without writing a pending record when ctx.images is unavailable", async () => {
    const ctx = makeCtx({ images: undefined });
    const result = await handler(ctx);

    expect(result).toEqual({
      outcome: "skipped",
      skipReason: "image model unavailable",
    });
    expect(ctx.pluginData.set).not.toHaveBeenCalled();
  });

  it("skips before any request when the selected slot is not an image model", async () => {
    const images = makeImages();
    images.isAvailable.mockReturnValue(false);
    const ctx = makeCtx({ images, userSettings: { modelPresetId: "story" } });
    const result = await handler(ctx);

    expect(result.outcome).toBe("skipped");
    expect(images.isAvailable).toHaveBeenCalledWith("story");
    expect(images.generate).not.toHaveBeenCalled();
    expect(ctx.pluginData.set).not.toHaveBeenCalled();
  });

  it("draws the image ID suffix from ctx.random when the host supplies it", async () => {
    const random = { int: vi.fn().mockReturnValue(35) };
    const ctx = makeCtx({ random });
    const result = await handler(ctx);

    expect(random.int).toHaveBeenCalledWith(0, 36 ** 6);
    expect(result.value.imageId).toMatch(/^img-[a-z0-9]+-00000z$/);
  });

  it("skips when no prompt can be extracted", async () => {
    const ctx = makeCtx({ triggerEvent: undefined });
    const result = await handler(ctx);

    expect(result.outcome).toBe("skipped");
    expect(result.skipReason).toMatch(/No image prompt/);
    expect(ctx.images.generate).not.toHaveBeenCalled();
  });

  it("calls ctx.images.generate with the raw x-separated size, passthrough negativePrompt, and metadata", async () => {
    const ctx = makeCtx({
      userSettings: {
        modelPresetId: "image",
        imageSize: "1440x720",
        n: 1,
        quality: "high",
        negativePrompt: "blurry, watermark",
        requestTimeoutMs: 60000,
      },
    });

    await handler(ctx);

    expect(ctx.images.generate).toHaveBeenCalledTimes(1);
    const [call] = ctx.images.generate.mock.calls[0];
    expect(call).toMatchObject({
      presetId: "image",
      prompt: "a koi pond at dusk",
      negativePrompt: "blurry, watermark",
      size: "1440x720", // raw x-separated form — the wire does the *-conversion, not this handler
      quality: "high",
      n: 1,
      metadata: { source: "dashscope-image-gen", turnId: "turn-1" },
    });
    expect(call.signal).toBeInstanceOf(AbortSignal);
  });

  it("omits negativePrompt when the setting is empty", async () => {
    const ctx = makeCtx({ userSettings: { negativePrompt: "" } });

    await handler(ctx);

    const [call] = ctx.images.generate.mock.calls[0];
    expect(call.negativePrompt).toBeUndefined();
  });

  it("surfaces wire warnings into the logger and the done record", async () => {
    const warnings = [
      "model wan2.7-image-pro rejects negative_prompt; dropped",
    ];
    const ctx = makeCtx({
      images: makeImages({ refs: [makeRef()], warnings, cached: false }),
    });

    const result = await handler(ctx);

    expect(result.outcome).toBe("success");
    expect(result.value.warnings).toEqual(warnings);
    // warnings land on the plugin-data record so the gallery can show them,
    // and on the completed _logs entry for debug-page visibility
    expect(result.effects.pluginData[0].value.warnings).toEqual(warnings);
    expect(ctx.logger.info).toHaveBeenCalledWith(
      "image.generate.completed",
      expect.objectContaining({ warnings }),
    );
  });

  it("marks the record cached for a promptHash-dedup hit and keeps the bare imageId key", async () => {
    const ctx = makeCtx({
      images: makeImages({
        refs: [makeRef("cached-ref")],
        warnings: [],
        cached: true,
      }),
    });

    const result = await handler(ctx);

    expect(result.value.cached).toBe(true);
    expect(result.effects.pluginData[0].value.cached).toBe(true);
    expect(result.effects.pluginData[0].key).toBe(result.value.imageId); // single ref keeps the bare imageId key
  });

  it("keys multi-ref results as <imageId>, <imageId>-2 and exposes refs[]", async () => {
    const ctx = makeCtx({
      images: makeImages({
        refs: [makeRef("a"), makeRef("b")],
        warnings: [],
        cached: false,
      }),
    });

    const result = await handler(ctx);

    expect(result.value.refs).toHaveLength(2);
    // The first image keeps the pre-written pending record's key, so no
    // pending card stays behind; later images take -2, -3, ...
    expect(result.effects.pluginData.map((entry) => entry.key)).toEqual([
      result.value.imageId,
      `${result.value.imageId}-2`,
    ]);
    expect(result.effects.assetGenerations).toHaveLength(2);
    // meta.prompt is the note the story model reads where the picture appears.
    expect(result.effects.assetGenerations[0].meta.prompt).toBe(
      "a koi pond at dusk",
    );
  });

  it("returns a failed record when the provider resolves with zero images", async () => {
    const ctx = makeCtx({
      images: makeImages({
        refs: [],
        warnings: ["no output"],
        cached: false,
      }),
    });

    const result = await handler(ctx);

    expect(result.value.status).toBe("failed");
    expect(result.value.error).toMatch(/no images/i);
    expect(ctx.pluginData.set).toHaveBeenLastCalledWith(
      "images",
      expect.any(String),
      expect.objectContaining({ status: "failed" }),
    );
  });

  it("returns a failed record when ctx.images.generate throws", async () => {
    const ctx = makeCtx({
      images: makeImages(new Error("DashScope WAN generation FAILED: boom")),
    });

    const result = await handler(ctx);

    expect(result.value.status).toBe("failed");
    expect(result.value.error).toBe("DashScope WAN generation FAILED: boom");
  });
});
