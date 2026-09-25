# Jev Choice Recommendations Demo

**English** · [简体中文](README.zh-CN.md)

This optional plugin demonstrates evaluation models, public plugin services, scheduled inputs, and custom UI. It displays the model's recommendation probabilities below the current scene's quick replies. The UI and algorithm live entirely in this plugin; it does not choose or submit actions for the player.

## Installation and approval

This officially maintained community plugin targets the current Covel `0.0.39` development contract and is no longer bundled with the main repository. In **Settings → Plugins → Install & manage**, enter:

```text
https://github.com/covel-ai/covel-plugins/tree/main/examples/jev-choice-demo
```

Resolution and downloads use Covel's configured network proxy. Review the source and server-side code risks, confirm installation, restart the backend, then enable and approve the plugin in your session. Official maintenance does not waive community code approval. Model calls may incur costs. The packaged JavaScript runs directly without dependency installation or a build step.

When migrating from the builtin version, plugin IDs, runtime IDs, and setting keys remain unchanged. Existing sessions require approval again after installation. Migration does not proactively delete saves, configuration, or media, and it does not automatically convert builtin trust into community code approval.

## Usage

1. In model settings, configure TypeSafe's official provider, OpenRouter, Vercel AI Gateway, or another provider with a supported wire, and add an Evaluation model. See [Covel's llm.toml.example](https://github.com/ackness/covel/blob/main/llm.toml.example) for configuration examples.
2. Bind the model to the `evaluation` role, or select another bound role in the plugin's evaluation model setting. You can optionally specify a recommendation goal. The protocol, base URL, and model name come from configuration; the code does not hardcode Jev or any provider.
3. Enable this plugin and plugins providing the `scene-prompts` and `narrative-engine` capabilities, then complete a new turn. The plugin UI appears in both the right panel and the stage decision area.

Enabling the plugin does not rerun earlier turns. Missing model configuration or provider errors produce an unavailable state; ordinary choices remain usable. If a provider returns only a winning option without a probability distribution, the UI marks that option without inventing percentages. Probabilities describe the model's preferences among the given candidates, not the chance that an action will succeed.

## Files and communication

| File | Responsibility |
| --- | --- |
| `PLUGIN.md` / `schemas/` | Declare required inputs and validation; execute after upstream completion |
| `server.js` | Register the `recommend` public service using the `demo/choice-recommendation@1` protocol and call `ctx.gateway.evaluate` |
| `handler.js` | Pass the current narrative, scene, and player intent to the service; write this plugin's `recommendations/current` through effects |
| `recommendation-schema.js` | Define the plugin's recommendation record; the framework does not reference it |
| `ui/recommendations.json` | Declare the data namespace, HTML, and panel/stage mounts |
| `ui/recommendations.html` | Render probability bars and localized text; check turn ownership and hide stale results |
| `tests/` | Verify probabilities, missing distributions, configuration errors, cancellation, and data ownership |

`scene-prompts` exposes `{ scene, recap, decision, prompts }` through its `output.schema`. This plugin consumes it by capability without reading upstream internal plugin-data or importing upstream code. Another quick-reply implementation can replace it if it satisfies the same contract.

Other function plugins can discover and call this plugin's service without enabling the recommendation UI or importing its source:

```js
const providers = await ctx.services.discover("demo/choice-recommendation@1");
const provider = providers.find((item) => item.pluginId === configuredPluginId);
if (!provider)
  return { outcome: "skipped", skipReason: "No recommendation provider" };
const result = await ctx.services.call({
  ...provider,
  input: {
    presetId: "evaluation",
    goal: "Choose the action that best follows the player's intent.",
    state: { scene: "The library is closing." },
    options: [
      { id: "ask", text: "Ask the librarian for help" },
      { id: "leave", text: "Leave and return tomorrow" },
    ],
  },
});
```

The service only computes a value; the caller decides how to persist it and apply gameplay effects. NPC decision or candidate-ranking plugins can use the same service. To extend Boolean/Score evaluation or add a protocol, register another service and component in your own plugin. See [Plugin extension contracts](https://github.com/ackness/covel/blob/main/docs/reference/plugin-extensions.md).

## Tests and limitations

Run the following command from this repository's root, after `pnpm install --frozen-lockfile` on first setup:

```bash
pnpm exec vitest run examples/jev-choice-demo/tests
```

Unit tests use synthetic model responses to cover probability validation, service calls, cancellation, and data ownership. They do not evaluate live model accuracy, calibration, pricing, or latency.

The demo limits state text length, times out a single evaluation after 10 seconds, and limits the plugin to 15 seconds. Adjust these limits for your samples and budget.

The plugin is disabled by default. Players must enable it manually, or a world/bundle must explicitly include it. `role:demo` does not participate in tag or capability matching, or automatic selection for worlds without a policy. The stage provides ownership information for the current turn and committed retries, plus the current options. The plugin checks the turn, option IDs, and text, hiding stale or mismatched results.

## Data, network access, and license

Business data is written only to this plugin's declared namespaces. Images or audio use the framework's MediaStore; model calls use the host's configured roles and credentials. Logs and errors may contain prompts or provider error details. Do not publish private session logs. Source code is licensed under [MIT](LICENSE).
