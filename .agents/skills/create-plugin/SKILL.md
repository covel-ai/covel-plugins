---
name: create-plugin
description: Create or update installable Covel gameplay, media, tool, and UI plugins. Use for plugin manifests, handlers, model integration, and plugin tests; not for modifying Covel kernel behavior or creating agent skills.
license: MIT
metadata:
  covel-contract: "0.0.39"
  development-tools: "Node.js 26+; pnpm 11.22"
---

# Create a Covel plugin

Build the requested plugin using the public Covel contract. This skill is adapted from the Covel main repository's `create-plugin` skill for the standalone community repository. Follow explicit user requirements and the target repository's instructions.

## Choose the package location

- In this repository, optional official features belong in `plugins/<id>/`; instructional demos belong in `examples/<id>/`.
- For third-party authors, use their chosen repository. The official directory indexes third-party repositories without copying their source.
- Do not write directly to an installed `~/.covel/plugins` directory unless the user requested installation or editing that copy.
- Official maintenance is index metadata, not a runtime trust level. External official plugins still need community code approval. Use `pluginType: plugin`.

Read [the publishing contract](../../../docs/publishing.md) and [manifest fields](references/plugin-schema.md) before choosing the implementation. Preserve plugin IDs, runtime IDs, namespaces, and configuration keys when updating an existing plugin unless the task requires a breaking change.

## Package requirements

Each installable directory contains `package.json`, `PLUGIN.md`, `README.md`, and a license. JavaScript is ESM and directly executable, with relative `.js` imports contained inside the package. The GitHub installer does not install dependencies, run lifecycle scripts, or build code. Do not use `workspace:*`, imports from sibling plugins, or runtime dependencies in package.json. Development tools may live at the repository root; required runtime dependencies must be bundled with their license, source version, and regeneration instructions.

```json
{
  "name": "@covel/plugin-example",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "license": "MIT",
  "engines": { "node": ">=26" }
}
```

Use the actual copyright holder and authorized license; do not assign MIT to third-party code without permission. Include a repository URL and package subdirectory for an official package. Display names and descriptions should support `zh-CN` and `en-US`.

For multiple runtimes, use `runtimes/<name>/PLUGIN.md` and a root summary manifest. Put entry registration in `server/index.js` (or another explicit `entry`). Entry factories receive `covel.toolkit`, `covel.http`, and registration APIs; they should register behavior without starting network requests. Handlers receive a single `ctx` argument.

## Implementation decisions

- Agent runtimes use their Markdown body as a prompt; function runtimes use `handler: ./handler.js`.
- Stage-scheduled `auto` / `scheduled` runtimes declare `stage`. `manual` / `event` runtimes do not declare stage; use `execution: background` for long requests.
- Read same-execution outputs through typed `inputs`; use capability dependencies instead of hardcoded upstream plugin IDs. Do not use numeric priority or `ctx.completedResults`.
- Use `ctx.images.generate` for images and `ctx.speech.generate` / `.transcribe` for speech. Register a provider-specific wire through `covel.registerWires` if a supported modality needs a custom protocol.
- Use `ctx.gateway.evaluate` for evaluation and `covel.registerService` / `ctx.services` for reusable public plugin services. Service inputs and outputs need validation. A service gateway does not expose API keys or authorization headers through `resolveSlot`.
- Persist business results through `outcome: "success"`, `value`, and `effects`. Media uses MediaStore references, not base64 in plugin-data. Do not write reserved `_jobs` or `_logs` namespaces.
- Preserve cancellation, enforce bounded work, and explain unavailable configuration without inventing model outputs. Do not log keys or publish private prompts in fixtures.
- Community runtime HTTP helpers and remote media ingestion require exact `permissions.http` origins and methods, including redirected CDN origins. Official index status does not bypass these checks.
- UI specs use declared mount points and data namespaces. A custom HTML webview uses the host bridge; validate the current turn and input ownership before displaying results.

Read only the references relevant to the plugin:

| Work                                         | Reference                                             |
| -------------------------------------------- | ----------------------------------------------------- |
| Function context, effects, gateway, services | [Runtime contract](references/runtime-context.md)     |
| Model roles and configuration                | [Model slots](references/llm-toml-slots.md)           |
| Custom provider protocol                     | [Provider wires](references/provider-quirks.md)       |
| Local tools registered by an entry factory   | [Tool factory](references/tool-factory.md)            |
| JSON UI, bindings and actions                | [UI components](references/ui-components-quickref.md) |
| Working package examples                     | [Official examples](references/example-plugins.md)    |
| Package and host validation                  | [Testing](references/plugin-testing.md)               |

References describe the current development contract. When uncertain, use the linked current Covel documentation or inspect the matching host version. Do not invent compatibility adapters for old development data.

## Finish and publish

Write README instructions for GitHub installation, restart and session approval, required capabilities, model configuration, data writes, network access, cost, tests, and known limitations. Every configuration snippet should be usable after replacing clearly marked placeholders.

Add an official index entry only for an authorized official plugin; third-party submissions use `maintainer: community`. State the tested Covel version and keep unverified plugins pending. Run `node scripts/registry.mjs` to regenerate the README table, then the relevant checks in [Testing](references/plugin-testing.md). Report what actually ran and any external services not tested. Publishing to GitHub follows the user's authorization; this skill alone does not authorize a push or PR.
