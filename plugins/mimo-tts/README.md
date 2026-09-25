# @covel/plugin-mimo-tts

**English** · [简体中文](README.zh-CN.md)

Read narrator output aloud with Xiaomi **MiMo TTS**. The plugin automatically generates one audio track per turn (optional) and lists tracks in a right-hand tab. Story messages also provide a **Read aloud** button using the same interaction pattern as **Insert image**.

## Installation and approval

This officially maintained community plugin targets the current Covel `0.0.39` development contract and is no longer bundled with the main repository. In **Settings → Plugins → Install & manage**, enter:

```text
https://github.com/covel-ai/covel-plugins/tree/main/plugins/mimo-tts
```

Resolution and downloads use Covel's configured network proxy. Review the source and server-side code risks, confirm installation, restart the backend, then enable and approve the plugin in your session. Official maintenance does not waive community code approval. Model calls may incur costs. The packaged JavaScript runs directly without dependency installation or a build step.

When migrating from the builtin version, plugin IDs, runtime IDs, and setting keys remain unchanged. Existing sessions require approval again after installation. Migration does not proactively delete saves, configuration, or media, and it does not automatically convert builtin trust into community code approval.

## Package contents

- `mimo-tts/auto-narrate` (function · auto · `stage: post-turn` · `turnCompletion: detached` · `needs: capability narrative-engine`): after the current narrative engine (narrator or chat-mode-narrator) succeeds, persistently queues background narration without blocking the next turn. It also writes message data for the **Read aloud** button, even when automatic narration is disabled, so the button remains available.
- `mimo-tts/manual-narrate` (function · manual · `execution: background`): triggered by the **Read aloud** button. Paragraph text arrives through the button payload; manual activation does not resolve turn inputs, so `payload.text` is required.
- `lib/wires.js`: the MiMo TTS HTTP wire (`api-key` header, OpenAI-style `chat/completions`, and `audio.format/voice`). `lib/mimo-tts.js`: helpers for track records and display fields.
- `ui/audio-tab.json`: a playlist tab with one row per turn, a header (turn number, AUTO/MANUAL, voice, and byte count), a short text preview, and inline `<audio controls>`. It avoids repeating the full narrator text already in the chat stream; users select playback by turn.
- `ui/play-button.json`: the message button, on the same interaction layer as **Insert image**.

## Initial configuration

### 1. Configure the MiMo slot in `~/.covel/llm.toml`

Use `[covel.mimo-tts]` as the default section name, matching the plugin ID. Both runtimes default to `modelPresetId: "mimo-tts"`:

```toml
[covel.mimo-tts]
provider = "xiaomi"
model    = "mimo-v2.5-tts"   # Or mimo-v2.5-tts-voicedesign / mimo-v2.5-tts-voiceclone
baseUrl  = "https://token-plan-cn.xiaomimimo.com/v1"   # Or https://api.xiaomimimo.com, depending on your key plan
protocol = "openai-chat-v1"   # Required field; not used by this plugin's custom wire
tag      = "speech"
output   = ["audio"]
providerRequestMetadata = { speechWire = "mimo-tts/mimo" }
```

> MiMo uses an `api-key: <KEY>` header instead of `Authorization: Bearer`, and text must be placed in `messages: [{role: 'assistant', content}]`. The plugin's wire implements both requirements. Framework slot resolution supplies `baseUrl`, `apiKey`, and `model`.
> A trailing `/v1` in `baseUrl` is stripped automatically, so either form works.

> `mimo-v2-tts` was retired on 2026-06-30; use `mimo-v2.5-tts`. After migration, `mimo_default` maps to Bingtang for Chinese and Mia for other languages. See the [MiMo deprecation notice](https://mimo.mi.com/docs/en-US/updates/deprecate) and [model list](https://mimo.mi.com/docs/en-US/quick-start/model).

### 2. Add the API key

On desktop, edit `~/.covel/keys.env` using the `{UPPERCASE_PROVIDER}_API_KEY` convention (`provider = "xiaomi"` → `XIAOMI_API_KEY`):

```bash
XIAOMI_API_KEY=sk-...
```

On the web, enter the key for `xiaomi` in **Settings → API Keys**.

> `token-plan-cn.xiaomimimo.com` and `api.xiaomimimo.com` are public HTTPS hosts. The framework's SSRF guard allows public hosts by default while blocking private IPs, cloud metadata, and non-HTTPS requests. No environment override is needed.

### 3. Enable the plugin

Install through the link above and restart the backend. Enable the plugin in your session and approve its server-side code.

## User settings (`userSettings`)

| Runtime | Key | Description |
| --- | --- | --- |
| auto-narrate | `enabled` | Disable to keep manual narration only |
| Shared | `modelPresetId` | A `slot` setting shown as a selector of configured slots; defaults to `mimo-tts`, matching `[covel.mimo-tts]` |
| Shared | `voice` | Defaults to `mimo_default`; use a pregenerated ID for voicedesign / voiceclone |
| Shared | `format` | `mp3` (default, audio/mpeg) or `wav` (audio/wav). `pcm` / `pcm16` are not exposed because browsers cannot play them directly |
| Shared | `maxChars` | Maximum characters per synthesis request, to avoid server limits |
| Shared | `requestTimeoutMs` | Timeout for a single request |

> Shared settings are declared in both runtimes and **must be identical**. Their storage keys are plugin-wide (`plugin.mimo-tts.<key>`); inconsistent declarations cause only one to take effect. `pnpm --dir "$COVEL_REPO" validate:plugin "$PWD/plugins/mimo-tts"` detects drift. Set `COVEL_REPO` to a main Covel checkout and run the command from this repository's root.

## Data layout

- **plugin_data**: namespace `tracks`, with keys such as `tts-auto-<turnId>` or `tts-manual-<turnId>-<rand>`. Values contain `ref` (MediaRef), `triggeredBy`, `text`, and metadata.
- **plugin_data**: namespace `message`, keyed by turn ID, with values `{ turnId, text }`. This anchors the **Read aloud** button to a message and supplies its payload; auto-narrate writes it each turn.
- **media_assets**: `ctx.speech.generate()` persists audio bytes in MediaStore with promptHash deduplication. Ownership is automatically bound to the current session.
- **runtime output**: `assetGenerations: [{ref, modality:'audio', meta}]` is collected by the framework as an `asset.generate` proposal and broadcast through trace and SSE.

## Tests

Run from this repository's root after `pnpm install --frozen-lockfile`:

```bash
pnpm exec vitest run plugins/mimo-tts/tests   # Covers the wire and both handlers
```

Tests mock only `fetch` at the wire layer and `ctx.speech.generate` / `ctx.gateway.resolveSlot` at the handler layer. No live network or MiMo key is required.

## Known limitations and roadmap

| Item | Status |
| --- | --- |
| Autoplay | The themed `AudioPlayer` catalog component has no `autoPlay` prop, and most browsers restrict automatic playback. Track records already include `plugin_data.tracks[*].autoPlay = true`, ready for framework support. |
| Pending status | The tab intentionally displays only done/failed entries, without a generating placeholder. Pending work is exposed through logs and SSE traces. |
| Streaming | Not implemented. MiMo's `stream: true` changes the format to `pcm`, which browser `<audio>` cannot consume directly. It would require a frontend PCM-to-Web-Audio worker or backend MP3 conversion before chunking. The wire currently uses non-streaming requests, pending a framework streaming-media primitive. |
| Playback speed | Native browser controls can offer 0.5×/2× speed through the audio element's context menu. Dedicated buttons could be added later through a custom component in the UI spec. |
| Long text | Currently truncated with `maxChars`; future work could synthesize overlapping text segments and play them in sequence. |

## References

- MiMo documentation: [OpenAI-compatible API](https://mimo.mi.com/docs/api/chat/openai-api) · [Speech synthesis](https://mimo.mi.com/docs/usage-guide/speech-synthesis)
- Framework documentation: [Plugin authoring](https://github.com/ackness/covel/blob/main/docs/guide/plugin-authoring.md) · [MediaStore](https://github.com/ackness/covel/blob/main/docs/reference/media-store.md) · [UI components](https://github.com/ackness/covel/blob/main/docs/reference/ui-components.md)

## Data, network access, and license

Business data is written only to this plugin's declared namespaces. Images or audio use the framework's MediaStore; model calls use the host's configured roles and credentials. Logs and errors may contain prompts or provider error details. Do not publish private session logs. Source code is licensed under [MIT](LICENSE).

`tests/runtime-cases.json` uses the main repository's debugger only to check manual calls when the speech pipeline is unavailable. The debugger does not drive detached automatic turns. `tests/handlers.test.js` covers missing narrative, disabled narration, success, failure, and cancellation for automatic narration. Real background scheduling must be verified in a Covel session.
