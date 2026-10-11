# openai-image-gen

**English** · [简体中文](README.zh-CN.md)

An image-generation plugin for the OpenAI Images API. Generation uses the framework's unified `ctx.images.generate()` pipeline. The plugin assembles prompts and stores the returned `MediaRef[]` in a gallery; the framework handles HTTP requests, SSRF guards, response parsing, and idempotent deduplication. The default model is `gpt-image-2`. Third-party services can reuse the current `openai-images` wire only if they implement the standard OpenAI Images request and response shapes.

**All credentials are resolved through `~/.covel/llm.toml`**, following the same design as dashscope-image-gen. Add a provider by configuring a `[covel.<slot>]` block, without editing plugin code.

## Installation and approval

This officially maintained community plugin targets the Covel `0.0.50` development contract (`covel: ">=0.0.50"` in `PLUGIN.md`; hosts outside that range do not load it) and is no longer bundled with the main repository. In **Settings → Plugins → Install & manage**, enter:

```text
https://github.com/covel-ai/covel-plugins/tree/main/plugins/openai-image-gen
```

Resolution and downloads use Covel's configured network proxy. Review the source and server-side code risks, confirm installation, restart the backend, then enable and approve the plugin in your session. Official maintenance does not waive community code approval. Model calls may incur costs. The packaged JavaScript runs directly without dependency installation or a build step.

When migrating from the builtin version, plugin IDs, runtime IDs, and setting keys remain unchanged. Existing sessions require approval again after installation. Migration does not proactively delete saves, configuration, or media, and it does not automatically convert builtin trust into community code approval.

## Package layout

```text
openai-image-gen/
├── PLUGIN.md                       # id, version, covel range, tools, media.image-flow@1, settings, UI
├── locales/zh.yaml                 # Chinese labels and UI text (locales/lock.json records their English source)
├── server/index.js                 # entry: registers the two submission tools and the image-flow extension
├── tools/submit-image-prompt.js
├── lib/covel-helpers.js            # bundled SDK helpers (image generation, proposals, tool results)
└── runtimes/
    ├── prompt-generator/           # agent: RUNTIME.md (English), RUNTIME.zh.md, output.schema.json, ui/
    └── image-generator/            # function: RUNTIME.md, handler.js, ui/
```

Version 0.1.0 moves the package to the Covel 0.0.50 format: the runtimes are `runtimes/<id>/RUNTIME.md` with grouped fields, settings and UI specs are declared once in the root `contributes`, labels and UI text are English with Chinese translations in `locales/zh.yaml`, and the English prompt body has a Simplified Chinese variant in `RUNTIME.zh.md`. Plugin, runtime, tool and setting IDs are unchanged. After updating an installed copy, restart the backend and approve the plugin in your session as for a new installation.

## Comparison with dashscope-image-gen

| Aspect | openai-image-gen | dashscope-image-gen |
| --- | --- | --- |
| Default model | `gpt-image-2` | `wan2.7-image-pro` |
| Size format | `1024x1024` (lowercase x) | `1024*1024` (asterisk) |
| Event topic | `openai-image.generate.requested` | `image.generate.requested` |
| Credentials | `[covel.<slot>]` in `~/.covel/llm.toml`, default slot `openai-image` | `[covel.<slot>]` in `~/.covel/llm.toml`, default slot `image` |

Both plugins can be installed together, but a session uses one of them: each provides the single-provider extension point `media.image-flow@1` (through which the host finds the illustration flow for its own image button), so the session resolver accepts only one illustration flow per session. Their event topics and galleries are separate in any case (`pluginData` is isolated by `pluginId`). Both wires are handled by the framework's image-wire registry; neither plugin has HTTP or SDK dependencies.

When the selected `modelPresetId` slot is missing or is not an image model, `image-generator` returns `skipped` before writing a gallery record or sending a request.

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

### Configure slots for both image plugins

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

By default, dashscope-image-gen uses `modelPresetId = "image"` → wan2.7, while openai-image-gen uses `modelPresetId = "openai-image"` → gpt-image-2. Choose the plugin per session; the active one shows its **Generate** button and gallery in the right panel.

## Runtimes

| Runtime | Type | Trigger | Responsibility |
| --- | --- | --- | --- |
| `openai-image-gen/prompt-generator` | agent (background) | manual | Read recent prompt history in the background, combine `composition` and `promptMode` to write an image prompt, then call the matching submission tool to archive it, emit a fixed event, and wake the downstream runtime. Entry runtime of `media.image-flow@1` |
| `openai-image-gen/image-generator` | function (background) | event: `openai-image.generate.requested` | Call `ctx.images.generate()` for wire selection, requests, MediaStore persistence, and promptHash deduplication; write index records containing `ref` from the returned `MediaRef[]` to the `images` namespace and return one `assetGenerations[]` effect per image. Asset runtime of `media.image-flow@1` |

## Settings

All settings are declared once in the root `PLUGIN.md` (`contributes.settings`) and both runtimes read them from `ctx.userSettings`. Used by prompt-generator, with the same structure as dashscope-image-gen:

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `composition` | select | `comic-strip` | `single-scene` for one moment; `comic-strip` for a full-page sequence of panels |
| `comicPanels` | select | `auto` | Only for `comic-strip`; `auto` lets the model choose 2–6 panels |
| `comicLayoutStyle` | select | `dynamic` | `strict-grid` / `dynamic` / `splash-led` |
| `promptMode` | select | `text` | `text` for natural language; `image-json` for structured JSON |

Used by image-generator:

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `modelPresetId` | slot | `openai-image` | The `[covel.<slot>]` name in `~/.covel/llm.toml`, shown as a selector of configured slots. To switch providers or models, add a slot and select it here |
| `imageSize` | text | `1024x1024` | OpenAI Images API size parameter, using lowercase x |
| `n` | number | `1` | Images per request |
| `quality` | text | `low` | GPT Image accepts `low` / `medium` / `high` / `auto` |
| `style` | text | _(empty)_ | Optional; appended to the prompt as `<prompt>, style: <style>`, rather than passed as a separate wire parameter |

> **Quality instructions**: the prompt-generator prompt (`RUNTIME.md` / `RUNTIME.zh.md`) requires terms such as 4K, ultra detailed, and masterpiece at the end of each prompt or in its `quality` field. Comic mode also adds `crisp ink lines, clean panel borders, professional manga / comic page composition`.

### Removed settings

Before the unified image pipeline, `image-generator` exposed `model` (per-call model override), `maxRetries` (retry count), and `extraProviderOptions` (additional JSON parameters). They are no longer declared:

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
# The mock harness has no image model, so image-generator returns
# skipped (image model unavailable); this is expected, not a regression.
# Unit tests: pnpm exec vitest run plugins/openai-image-gen/tests
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
- The gallery reads the `images` namespace. `ctx.images.generate()` persists bytes in MediaStore and returns `MediaRef[]`; the handler writes `ref` into `images.<imageId>`. A multi-image request writes the first image to `images.<imageId>` (replacing its pending record) and the others to `images.<imageId>-2`, `images.<imageId>-3`, …. Each image is also returned as an `assetGenerations[]` effect whose `meta.prompt` the story model reads in later turns where the picture appeared. SSE `plugin-data.changed` refreshes the gallery automatically, and the frontend resolves references through `<Media src={ref}>`.
- **Credentials**: the plugin does not persist apiKey or baseUrl in settings.json. `ctx.images.generate()` resolves the framework slot using `modelPresetId`, just as dashscope-image-gen does.
- The plugin adds no third-party HTTP SDK. Framework dependencies are managed in Covel's root workspace.

Before running `test:runtime`, set `COVEL_REPO` to a main Covel checkout. This command belongs to the main repository; run the commands above from this repository's root. Plugin installation does not require this tool. Run unit tests in this repository after `pnpm install --frozen-lockfile`.

## Data, network access, and license

Business data is written only to this plugin's declared namespaces. Images or audio use the framework's MediaStore; model calls use the host's configured roles and credentials. Logs and errors may contain prompts or provider error details. Do not publish private session logs. Source code is licensed under [MIT](LICENSE).

## Image download permissions for community plugins

If a model returns a URL, downloading the image remains subject to the runtime's `permissions.http`. Models returning base64 or bytes do not require remote image downloads. Do not resolve download failures by raising the trust level or bypassing SSRF checks.

For compatible services that return URLs or for other regions, verify image domains in the provider's official documentation. Declare the exact HTTPS origins and GET method in the installed package's `runtimes/image-generator/RUNTIME.md`, then restart and approve the code again. Every origin in a redirect chain must be declared. Do not use wildcards or full signed URLs. For example:

```yaml
permissions:
  http:
    - origin: https://images.example.com
      methods: [GET]
```

The default configuration expects GPT Image to return image bytes. A third-party compatible service that returns only URLs requires these download-domain declarations; otherwise, the gallery shows `http permission denied`.
