# openai-image-gen

**English** · [简体中文](README.zh-CN.md)

An image-generation plugin for the OpenAI Images API. Generation uses the framework's unified `ctx.images.generate()` pipeline. The plugin assembles prompts and stores the returned `MediaRef[]` in a gallery; the framework handles HTTP requests, SSRF guards, response parsing, and idempotent deduplication. The default model is `gpt-image-2`. Third-party services can reuse the current `openai-images` wire only if they implement the standard OpenAI Images request and response shapes.

**All credentials are resolved through `~/.covel/llm.toml`**, following the same design as dashscope-image-gen. Add a provider by configuring a `[covel.<slot>]` block, without editing plugin code.

## Installation and approval

This officially maintained community plugin targets the current Covel `0.0.39` development contract and is no longer bundled with the main repository. In **Settings → Plugins → Install & manage**, enter:

```text
https://github.com/covel-ai/covel-plugins/tree/main/plugins/openai-image-gen
```

Resolution and downloads use Covel's configured network proxy. Review the source and server-side code risks, confirm installation, restart the backend, then enable and approve the plugin in your session. Official maintenance does not waive community code approval. Model calls may incur costs. The packaged JavaScript runs directly without dependency installation or a build step.

When migrating from the builtin version, plugin IDs, runtime IDs, and setting keys remain unchanged. Existing sessions require approval again after installation. Migration does not proactively delete saves, configuration, or media, and it does not automatically convert builtin trust into community code approval.

## Comparison with dashscope-image-gen

| Aspect | openai-image-gen | dashscope-image-gen |
| --- | --- | --- |
| Default model | `gpt-image-2` | `wan2.7-image-pro` |
| Size format | `1024x1024` (lowercase x) | `1024*1024` (asterisk) |
| Event topic | `openai-image.generate.requested` | `image.generate.requested` |
| Credentials | `[covel.<slot>]` in `~/.covel/llm.toml`, default slot `openai-image` | `[covel.<slot>]` in `~/.covel/llm.toml`, default slot `image` |

Both plugins can be enabled together. Their different event topics avoid duplicate triggers, and their galleries are independent because `pluginData` is isolated by `pluginId`. Both wires are handled by the framework's image-wire registry; neither plugin has HTTP or SDK dependencies.

## Configure llm.toml and keys.env

### `~/.covel/llm.toml`

Add a slot:

```toml
[covel.openai-image]
provider = "openai"
model    = "gpt-image-2"
baseUrl  = "https://api.openai.com/v1"      # Change for a third-party service
apiKey   = "${env:OPENAI_API_KEY}"           # Change the environment variable for that service
protocol = "openai-chat-v1"
tag      = "image"
output   = ["image"]
```

`tag = "image"` is required for the framework to resolve `modelPresetId` to an image wire. The default wire is `openai-images`, so no extra declaration is needed. If a third-party response does not match the standard OpenAI Images shape, set `providerRequestMetadata.imageWire = "<another registered wire ID>"` in the slot.

### `~/.covel/keys.env`

```text
OPENAI_API_KEY=sk-xxx
```

For a third-party service, supply **both its key and its baseUrl**; update both lines together.

### Enable both image plugins

```toml
[covel.image]                              # DashScope wan2.7
provider = "dashscope"
model    = "wan2.7-image-pro"
baseUrl  = "https://dashscope.aliyuncs.com"
apiKey   = "${env:DASHSCOPE_API_KEY}"
protocol = "openai-chat-v1"
tag      = "image"
output   = ["image"]

[covel.openai-image]                       # OpenAI / third-party GPT-Image
provider = "openai"
model    = "gpt-image-2"
baseUrl  = "https://api.openai.com/v1"
apiKey   = "${env:OPENAI_API_KEY}"
protocol = "openai-chat-v1"
tag      = "image"
output   = ["image"]
```

By default, dashscope-image-gen uses `modelPresetId = "image"` → wan2.7, while openai-image-gen uses `modelPresetId = "openai-image"` → gpt-image-2. Each has its own **Generate** button and gallery in the right panel.

## Runtimes

| Runtime | Type | Trigger | Responsibility |
| --- | --- | --- | --- |
| `openai-image-gen/prompt-generator` | agent (background) | manual | Read recent prompt history in the background, combine `composition` and `promptMode` to write an image prompt, then call the matching submission tool to archive it, emit a fixed event, and wake the downstream runtime |
| `openai-image-gen/image-generator` | function (background) | event: `openai-image.generate.requested` | Call `ctx.images.generate()` for wire selection, requests, MediaStore persistence, and promptHash deduplication; write index records containing `ref` from the returned `MediaRef[]` to the `images` namespace and emit an `asset.generate` proposal |

## userSettings

prompt-generator uses the same structure as dashscope-image-gen:

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `composition` | select | `comic-strip` | `single-scene` for one moment; `comic-strip` for a full-page sequence of panels |
| `comicPanels` | select | `auto` | Only for `comic-strip`; `auto` lets the model choose 2–6 panels |
| `comicLayoutStyle` | select | `dynamic` | `strict-grid` / `dynamic` / `splash-led` |
| `promptMode` | select | `text` | `text` for natural language; `image-json` for structured JSON |

image-generator:

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `modelPresetId` | slot | `openai-image` | The `[covel.<slot>]` name in `~/.covel/llm.toml`, shown as a selector of configured slots. To switch providers or models, add a slot and select it here |
| `imageSize` | text | `1024x1024` | OpenAI Images API size parameter, using lowercase x |
| `n` | number | `1` | Images per request |
| `quality` | text | `low` | GPT Image accepts `low` / `medium` / `high` / `auto` |
| `style` | text | _(empty)_ | Optional; appended to the prompt as `<prompt>, style: <style>`, rather than passed as a separate wire parameter |

> **Quality instructions**: the prompt-generator's PLUGIN.md system prompt requires terms such as 4K, ultra detailed, and masterpiece at the end of each prompt or in its `quality` field. Comic mode also adds `crisp ink lines, clean panel borders, professional manga / comic page composition`.

### Removed settings

Before the unified image pipeline, `image-generator` exposed `model` (per-call model override), `maxRetries` (retry count), and `extraProviderOptions` (additional JSON parameters). They have been removed from PLUGIN.md:

- **`model`**: `ctx.images.generate()` accepts `presetId`, not a per-call model override. Add a `[covel.<slot>]` and switch `modelPresetId` to change models.
- **`maxRetries`**: the handler never implemented retries for this setting, so its removal does not remove working behavior.
- **`extraProviderOptions`**: plugin-side passthrough is no longer available. Configure static `providerRequestMetadata` in the llm.toml slot instead. It applies to every request through that slot, not individual calls:

```toml
[covel.openai-image]
provider = "openai"
model    = "gpt-image-2"
baseUrl  = "https://api.openai.com/v1"
apiKey   = "${env:OPENAI_API_KEY}"
protocol = "openai-chat-v1"
tag      = "image"
output   = ["image"]

[covel.openai-image.providerRequestMetadata]
# Provider-specific extra fields merged into the wire request body
moderation = "low"
```

## Tests

```bash
# Mock mode: verify tool submission and fixed events without real API calls.
# ctx.images is unavailable to image-generator in mock mode;
# status: failed is expected, not a regression.
pnpm --dir "$COVEL_REPO" test:runtime -- openai-image-gen --plugins-dir "$PWD/plugins" --pretty

# Live mode: requires OPENAI_API_KEY in keys.env and an openai-image slot in llm.toml.
# Generates real images in tests/tmp/ and may incur model costs.
pnpm --dir "$COVEL_REPO" test:runtime -- openai-image-gen --plugins-dir "$PWD/plugins" --mode live --pretty
```

## Third-party providers

The current `openai-images` wire calls `POST /images/generations` and parses `data[].b64_json` / `data[].url`. The following providers document this compatible interface:

- **Together AI**: `baseUrl=https://api.together.xyz/v1`, `model=black-forest-labs/FLUX.1-schnell`. Do not use the retired `black-forest-labs/FLUX.1-schnell-Free`. See the [Together Images API](https://docs.together.ai/reference/post-images-generations) and [model deprecations](https://docs.together.ai/docs/deprecations).
- **DeepInfra**: `baseUrl=https://api.deepinfra.com/v1/openai`, `model=black-forest-labs/FLUX-1-schnell`. See the [DeepInfra Image Generation API](https://docs.deepinfra.com/apis/image-generation).

Fireworks uses model workflow endpoints with a different response shape, while fal.ai uses `fal.run` / queue protocols. Neither works with the current `openai-images` wire. Do not substitute their base URLs in these examples unless the framework registers a dedicated compatible wire.

## Notes

- `gpt-image-2` is the default OpenAI model. With third-party services, use a model ID actually offered by that service. `gpt-image-1` is deprecated and `dall-e-3` has been removed from the API, so they are no longer listed as alternatives. See [OpenAI GPT Image 2](https://developers.openai.com/api/docs/models/gpt-image-2).
- The framework's `ctx.images.generate()` handles SSRF guards, baseUrl validation, and retries; the plugin does not implement these checks itself.
- The gallery reads the `images` namespace. `ctx.images.generate()` persists bytes in MediaStore and returns `MediaRef[]`; the handler writes `ref` into `images.<imageId>`. Multi-image requests publish separate records such as `images.<imageId>-1` and `images.<imageId>-2`. SSE `plugin-data.changed` refreshes the gallery automatically, and the frontend resolves references through `<Media src={ref}>`.
- **Credentials**: the plugin does not persist apiKey or baseUrl in settings.json. `ctx.images.generate()` resolves the framework slot using `modelPresetId`, just as dashscope-image-gen does.
- The plugin adds no third-party HTTP SDK. Framework dependencies are managed in Covel's root workspace.

Before running `test:runtime`, set `COVEL_REPO` to a main Covel checkout. This command belongs to the main repository; run the commands above from this repository's root. Plugin installation does not require this tool. Run unit tests in this repository after `pnpm install --frozen-lockfile`.

## Data, network access, and license

Business data is written only to this plugin's declared namespaces. Images or audio use the framework's MediaStore; model calls use the host's configured roles and credentials. Logs and errors may contain prompts or provider error details. Do not publish private session logs. Source code is licensed under [MIT](LICENSE).

## Image download permissions for community plugins

If a model returns a URL, downloading the image remains subject to the runtime's `permissions.http`. Models returning base64 or bytes do not require remote image downloads. Do not resolve download failures by raising the trust level or bypassing SSRF checks.

For compatible services that return URLs or for other regions, verify image domains in the provider's official documentation. Declare the exact HTTPS origins and GET method in the installed package's `runtimes/image-generator/PLUGIN.md`, then restart and approve the code again. Every origin in a redirect chain must be declared. Do not use wildcards or full signed URLs. For example:

```yaml
permissions:
  http:
    - origin: https://images.example.com
      methods: [GET]
```

The default configuration expects GPT Image to return image bytes. A third-party compatible service that returns only URLs requires these download-domain declarations; otherwise, the gallery shows `http permission denied`.
