# dashscope-image-gen

**English** · [简体中文](README.zh-CN.md)

A Covel text-to-image plugin for Alibaba Cloud DashScope (Tongyi Wan wan2.x). Its two-stage workflow uses an LLM to write a prompt, then the framework's unified `ctx.images.generate()` pipeline to generate and persist images in MediaStore. The `images` namespace stores `MediaRef` gallery indexes, and the right-hand gallery updates automatically.

The plugin does not issue image-generation HTTP requests itself. The framework's `dashscope-wan` image wire in `@covel/ai-provider` handles asynchronous task submission and polling, conversion of size separators from `x` to `*`, removal of unsupported `negative_prompt` for `wan2.7-image*` models with a warning, model-specific limits on `n` (1–4 for wan2.6/wan2.7 image models; one image for older wan2.x models), the `X-DashScope-Async` header, SSRF and redirect guards, and persistence of OSS results in MediaStore. The plugin has no HTTP or SDK dependencies; it assembles prompts and stores returned `MediaRef[]` in the gallery.

## Installation and approval

This officially maintained community plugin targets the Covel `0.0.50` development contract (`covel: ">=0.0.50"` in `PLUGIN.md`; hosts outside that range do not load it) and is no longer bundled with the main repository. In **Settings → Plugins → Install & manage**, enter:

```text
https://github.com/covel-ai/covel-plugins/tree/main/plugins/dashscope-image-gen
```

Resolution and downloads use Covel's configured network proxy. Review the source and server-side code risks, confirm installation, restart the backend, then enable and approve the plugin in your session. Official maintenance does not waive community code approval. Model calls may incur costs. The packaged JavaScript runs directly without dependency installation or a build step.

When migrating from the builtin version, plugin IDs, runtime IDs, and setting keys remain unchanged. Existing sessions require approval again after installation. Migration does not proactively delete saves, configuration, or media, and it does not automatically convert builtin trust into community code approval.

## Package layout

```text
dashscope-image-gen/
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

## Usage

- Click **Generate image** in the right panel (or the host's own image button, which it finds through `media.image-flow@1`) at any point in the story to create a single scene or a page of comic panels based on the current atmosphere.
- Choose composition and prompt format independently: `composition` is `single-scene` or `comic-strip`; `promptMode` is `text` (natural language) or `image-json` (structured JSON).
- Comic mode supports strict grids, dynamic layouts, or a dominant splash panel, with 2–6 panels.
- All modes include quality terms such as 4K, ultra detailed, and masterpiece to request high-quality rendering.
- One illustration flow per session: the plugin provides the single-provider extension point `media.image-flow@1`, so a session cannot have this plugin and `openai-image-gen` (or another illustration flow) active together. Both can stay installed; pick one per session.
- When the selected `modelPresetId` slot is missing or is not an image model, `image-generator` returns `skipped` before writing a gallery record or sending a request.
- To switch between models such as `qwen-image-3.0-pro`, `wan2.6-t2i`, `wan2.6-image`, `wan2.7-image`, and `wan2.7-image-pro`, add an `llm.toml` slot and change `modelPresetId` (see [Removed settings](#removed-settings)). The current flagship, **`qwen-image-3.0-pro`**, uses a synchronous endpoint without polling, offers the shortest generation wait, supports `negative_prompt`, and accepts up to six images per request. `wan2.6-t2i` is text-to-image only and supports `negative_prompt`. `wan2.7-image` prioritizes speed, and `wan2.7-image-pro` supports 4K text-to-image; neither supports `negative_prompt`, which the wire strips automatically. wan2.6/wan2.7 accept up to four images per request (`n`).

## Runtimes

| Runtime | Type | Trigger | Responsibility |
| --- | --- | --- | --- |
| `dashscope-image-gen/prompt-generator` | agent (background) | manual | Read recent prompt history in the background and call the submission tool for `promptMode`; the tool archives the prompt and emits `image.generate.requested` to wake the downstream runtime. Entry runtime of `media.image-flow@1` |
| `dashscope-image-gen/image-generator` | function (background) | event: `image.generate.requested` | Call `ctx.images.generate()` for wire selection, requests, MediaStore persistence, and promptHash deduplication; write index records containing `ref` from returned `MediaRef[]` to the `images` namespace and return one `assetGenerations[]` effect per image. Asset runtime of `media.image-flow@1` |

## Settings

All settings are declared once in the root `PLUGIN.md` (`contributes.settings`) and both runtimes read them from `ctx.userSettings`. Used by prompt-generator:

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `composition` | select | `comic-strip` | `single-scene` depicts one moment; `comic-strip` treats a full page as one image showing successive moments in panels |
| `comicPanels` | select | `auto` | Only for `comic-strip`. `auto` lets the model choose 2–6 panels; other values fix the count at 2/3/4/6 |
| `comicLayoutStyle` | select | `dynamic` | Only for `comic-strip`. `strict-grid` uses a regular grid and consistent borders; `dynamic` allows spanning panels and figures or action crossing gutters; `splash-led` uses one dominant splash panel with smaller panels as timeline anchors |
| `promptMode` | select | `text` | `text` produces a natural-language passage (about 80–150 words, 150–260 for comics, from the English prompt; 140–240 Chinese characters, 240–420 for comics, from `RUNTIME.zh.md`); `image-json` structures camera, lighting, subjects, style, and panels as JSON |

> **Quality instructions**: all modes require terms such as `4K, 8K, ultra HD, ultra detailed, highly detailed, masterpiece, best quality, sharp focus, intricate details` at the end of the prompt or in its `quality` field. Comic mode adds `crisp ink lines, clean panel borders, professional manga / comic page composition`. These are rules of the prompt-generator prompt (`RUNTIME.md` / `RUNTIME.zh.md`), not strings appended by the image-generator adapter.
>
> **Comic sizes**: set `imageSize` to `1440x720` for horizontal strips, `720x1440` for vertical layouts, or `1024x1024` for square panels to avoid cropping that disrupts the composition. Use `x` as the separator; the wire converts it to DashScope's `*` format.

Used by image-generator:

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `modelPresetId` | slot | `image` | The slot/preset ID in `llm.toml`, which determines provider/baseUrl/apiKey/model. The UI shows a configured-slot selector. Add a slot and select it here to change models |
| `imageSize` | text | `1024x1024` | Pixel dimensions separated by `x`, such as `1024x1024` or `1440x720`; the wire converts to `*`. wan2.6/wan2.7 also accept `1K` / `2K` tiers, passed through unchanged; `4K` is only for `wan2.7-image-pro` text-to-image |
| `n` | number | `1` | Images per request: 1–6 for `qwen-image-3.*`, 1–4 for `wan2.6-image` / `wan2.6-t2i` / `wan2.7-image*`, and one for older models. The wire clamps out-of-range counts and adds a warning |
| `requestTimeoutMs` | number | `300000` | Maximum wait for a generation request, including polling |
| `quality` | text | `low` | Quality hint; the native wan2.x API has no matching parameter, so the wire ignores it and retains it only for record display |
| `negativePrompt` | textarea | `low quality, blurry, watermark, text, extra fingers, distorted anatomy` | Passed to the wire. Unsupported by `wan2.7-image` models, so the wire strips it and returns a warning stored in `_logs` and the record's `warnings` field |

### Removed settings

Before the unified image pipeline, `image-generator` exposed a `model` setting for per-call model overrides. It is no longer declared.

`ctx.images.generate()` accepts `presetId`, not a per-call model override. To switch between `wan2.7-image` and `wan2.7-image-pro`, add a `[covel.<slot>]` and change `modelPresetId` instead of overriding the model temporarily within a slot.

## Configure llm.toml and keys.env

In `~/.covel/llm.toml`:

```toml
[covel.image]
provider = "dashscope"
model    = "qwen-image-3.0-pro"   # Recommended: synchronous, negative_prompt, n 1-6; alternatives: wan2.6-t2i / wan2.2-t2i-turbo
baseUrl  = "https://<WorkspaceId>.dashscope.aliyuncs.com/api/v1"
apiKey   = "${env:DASHSCOPE_API_KEY}"
protocol = "openai-chat-v1"
tag      = "image"
output   = ["image"]
providerRequestMetadata = { imageWire = "dashscope-wan" }   # Required for native wan2.x async endpoints; otherwise defaults to openai-images
```

To offer `wan2.7-image-pro` for 4K text-to-image as another option, add a slot and switch `modelPresetId`:

```toml
[covel.image-pro]
provider = "dashscope"
model    = "wan2.7-image-pro"
baseUrl  = "https://<WorkspaceId>.dashscope.aliyuncs.com/api/v1"
apiKey   = "${env:DASHSCOPE_API_KEY}"
protocol = "openai-chat-v1"
tag      = "image"
output   = ["image"]
providerRequestMetadata = { imageWire = "dashscope-wan" }
```

Prefer the workspace-specific `baseUrl` supplied by the console, replacing `<WorkspaceId>` with your workspace ID. The older `https://dashscope.aliyuncs.com` also works. The framework accepts base URLs ending in `/api/v1` without duplicating that path when adding the wire endpoint. See [DashScope Base URL](https://help.aliyun.com/en/model-studio/base-url).

In `~/.covel/keys.env`:

```text
DASHSCOPE_API_KEY=sk-xxx
```

## Tests

Run through `@covel/test-runtime` from this repository's root without starting a server. Cases are defined in [tests/runtime-cases.json](tests/runtime-cases.json); each case's `mode` marks it as mock-only, live-only, or both.

### Mock mode (default)

Runs only cases with `mode: "mock"`, using a stub LLM and mock slot for fast, CI-friendly checks:

```bash
pnpm --dir "$COVEL_REPO" test:runtime -- dashscope-image-gen --plugins-dir "$PWD/plugins" --pretty
```

All `mock-*` cases should pass, covering text/structured tool submission, argument repair, and visible failure when no tool is called. See runtime-cases.json for the exact list.

Positive cases simulate `prompt-generator` calling a submission tool. The tool emits the fixed `image.generate.requested` topic, and the framework wakes the `image-generator` follower as a background job. The mock harness has no image model, so the follower's availability check returns `skipped` (`image model unavailable`) and writes no gallery record; this is expected, not a regression. Assertions verify that the prompt was archived, the event emitted, and the follower skipped. The failure case checks the failed background job in `_runtime_jobs`.

### Unit tests (handler arguments)

`tests/handler.test.js` imports `handler.js` directly and uses a handwritten mock of `ctx.images` (`isAvailable` and `generate`) to check the availability skip, wire arguments (`negativePrompt` passthrough, preservation of `x` in `size` without local conversion, `n`, `quality`, `metadata`), record keys and `assetGenerations`. `tests/submit-image-prompt.test.js` checks the submission tools' explicit tool results, and `tests/entry.test.js` checks that the entry registers exactly the declared tools and the `media.image-flow@1` extension.

```bash
pnpm exec vitest run plugins/dashscope-image-gen/tests
```

### Live mode

Runs only cases with `mode: "live"`, calling configured prompt and image models. Generated PNGs are saved in `tests/tmp/`. Model calls may incur costs.

```bash
pnpm --dir "$COVEL_REPO" test:runtime -- dashscope-image-gen --plugins-dir "$PWD/plugins" --mode live --pretty
```

Run a single case:

```bash
pnpm --dir "$COVEL_REPO" test:runtime -- dashscope-image-gen \
  --plugins-dir "$PWD/plugins" \
  --case live-text-cyberpunk-shrine \
  --mode live --pretty
```

Call `image-generator` directly with a supplied prompt, without an LLM:

```bash
pnpm --dir "$COVEL_REPO" test:runtime -- dashscope-image-gen/image-generator \
  --plugins-dir "$PWD/plugins" \
  --payload '{"prompt":"a serene koi pond at dusk","promptMode":"text"}' \
  --user-settings '{"modelPresetId":"image","imageSize":"1024x1024"}' \
  --ignore-upstreams --mode live --pretty
```

## Choose a prompt format

| Mode | Input | Use case |
| --- | --- | --- |
| `text` | Natural-language passage | Describe the scene, atmosphere, and main subjects |
| `image-json` | Structured object serialized as prompt text | Explicitly organize camera, lighting, composition, and subject constraints |

The image model interprets both formats; structured text does not guarantee that every field will be followed. Use the live commands above to generate comparison samples. Temporary artifacts in `tests/tmp/` are not distributed with the plugin.

## Notes

- DashScope wan2.x OSS result URLs expire after 24 hours. `ctx.images.generate()` downloads bytes into MediaStore and returns content-addressed `MediaRef` values (`{ id, mime, size }`), so gallery images do not break when those URLs expire.
- The handler also returns one `assetGenerations[]` effect per image (`{ ref, modality: 'image', meta }`), which the kernel commits as an `asset.generate` proposal; frontend `<Media>` / `AssetRender` components resolve it automatically. `meta.prompt` is the line the story model reads in later turns where the picture appeared.
- A request for several images writes `images.<imageId>` for the first (replacing its pending record) and `images.<imageId>-2`, `images.<imageId>-3`, … for the others.
- `wan2.7-image` models do not support `negative_prompt`. The `dashscope-wan` wire strips it and returns a nonfatal warning, attached to the `_logs` entry `image.generate.completed` and the corresponding `images` record's `warnings` field.
- In `image-json` mode, `prompt` contains an already-stringified JSON object. DashScope passes it to the model as prompt text.
- Repeating the same parameters (`presetId` + `prompt` + `negativePrompt` + `size` + `quality` + `n` + `background`) hits the framework's promptHash deduplication cache without submitting a new DashScope task. Cache hits include `cached: true` in the record.

### Fields in the `images` namespace

| Field | Type | Description |
| --- | --- | --- |
| `ref` | `MediaRef` | Content-addressed reference to the main image bytes, resolved by `<Media src={ref} />` |
| `refs` | `MediaRef[]` (optional) | All references for multiple images; present only when there is more than one image source |
| `warnings` | `string[]` (optional) | Nonfatal wire notices, such as stripped negative_prompt or clamped n; present only when nonempty |
| `cached` | `boolean` (optional) | `true` on a promptHash cache hit; otherwise omitted |
| `imageId` / `prompt` / `promptMode` / `presetId` / `imageSize` / `n` / `quality` / `requestTimeoutMs` / `status` / `startedAt` / `completedAt` / `durationMs` | — | Gallery metadata. Records no longer contain `provider`, `baseUrl`, or `model`, which `ctx.images.generate()` does not return to the plugin. Consult the corresponding `llm.toml` slot when needed |

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

The default declarations cover Beijing and Shanghai result-storage domains, based on the [Wan API reference](https://help.aliyun.com/en/model-studio/text-to-image-v2-api-reference) and [Wan 2.6 reference](https://help.aliyun.com/en/model-studio/wan-image-generation-api-reference). Configure other regions or proxy services using their actual result domains.
