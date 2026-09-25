# Provider wires

Prefer the host's image, speech, transcription or evaluation capability. A custom header is not a reason to bypass the gateway or media pipeline.

For a supported modality with a different HTTP protocol:

1. Keep the wire in `lib/wires.js`; export a factory receiving the HTTP helpers.
2. Register it in the manifest entry with `covel.registerWires(buildWires(covel.http))`.
3. Select the namespaced wire through the model role's `providerRequestMetadata`.
4. Let the handler call `ctx.speech.generate`, `ctx.images.generate`, or `.transcribe`. Return bytes/URLs in the wire's public result shape; the framework handles MediaStore persistence.

The complete runnable example is [MiMo TTS](../../../../plugins/mimo-tts/README.md). Its role requires:

```toml
providerRequestMetadata = { speechWire = "mimo-tts/mimo" }
```

The host supplies provider configuration to the wire, including credentials. Do not put credentials in package files, userSettings, fixtures, logs or error messages. Use the provided SSRF-aware HTTP helpers and cancellation signal. Protocol details must come from current official provider documentation or upstream source.

For new operations outside the host's standard modality interfaces, use a validated plugin service and document its HTTP and credential requirements. Service calls lend a gateway whose `resolveSlot` does not reveal credentials; do not assume a service can read `slot.apiKey`.

## Community download boundary

`ctx.utils.fetchWithRetry` and remote media ingestion check the function runtime's `permissions.http` allowlist. An API response containing an image URL does not grant permission to download it. Declare exact HTTPS origins and methods, including CDN/redirect targets. See [DashScope's image manifest](../../../../plugins/dashscope-image-gen/runtimes/image-generator/PLUGIN.md). Do not promote the plugin to builtin trust or accept arbitrary hosts to make a provider work.

## Tests and errors

Mock wire HTTP and assert the endpoint, header names, body, response decoding, timeout and cancellation. Keep keys synthetic. Assert handler behavior when the capability or role is missing, when a provider fails, and when a turn is cancelled. Unit tests do not establish live model quality, latency or current pricing.

Use `ctx.progress.report` for live progress. Successful business records are committed through `success.effects`; failed or cancelled execution buffers are not committed. A persisted failure card is a deliberate successful result with a failed domain status, not a framework execution success guarantee.
