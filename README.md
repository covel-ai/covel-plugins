# Covel Plugins

<!-- languages:start -->
**English** · [简体中文](README.zh-CN.md)
<!-- languages:end -->

The official Covel plugin directory, optional extensions, and authoring examples. Community authors host their own code and can submit a pull request to list their plugins here.

Quick links: [Official plugins](#official-plugins) · [Community plugins](#community-plugins) · [Installation](#installation) · [Contributing](#contributing)

## Plugin groups

| Group | Purpose | Maintained in |
| --- | --- | --- |
| Core plugins | Essential implementations for the default game flow and framework contracts | [Covel main repository](https://github.com/ackness/covel) |
| Official plugins | Optional features and examples maintained by the Covel team | This repository's `plugins/` and `examples/` directories |
| Community plugins | Third-party gameplay, narrative styles, and tools | Authors' repositories; this repository maintains the index |

Maintenance, feature category, and runtime trust are separate concepts. All externally installed plugins, including official ones, follow Covel's community code approval rules.

## Plugin directory

Official plugins appear first, followed by a separate community list. Tables in every language are generated from `registry/plugins/*.json`; edit the entries rather than the tables.

<!-- registry:start -->
### Official plugins

| Plugin | Description | Author | Covel version | Status | Demo | Install source |
| --- | --- | --- | --- | --- | --- | --- |
| [DashScope Images](https://github.com/covel-ai/covel-plugins) | A two-stage workflow combining LLM prompts, Wan image generation, and a persistent gallery. | covel-ai | 0.0.39 | Available | [Demo](https://github.com/covel-ai/covel-plugins/blob/main/plugins/dashscope-image-gen/README.md) | [Install source](https://github.com/covel-ai/covel-plugins/tree/main/plugins/dashscope-image-gen) |
| [Story Note Example](https://github.com/covel-ai/covel-plugins) | Demonstrates adding a narrative suggestion to story prompts through PostContextAssembly. | covel-ai | 0.0.39 | Available | [Demo](https://github.com/covel-ai/covel-plugins/blob/main/examples/story-note/README.md) | [Install source](https://github.com/covel-ai/covel-plugins/tree/main/examples/story-note) |
| [Jev Choice Recommendations Demo](https://github.com/covel-ai/covel-plugins) | An advanced example combining typed inputs, evaluation models, public services, and a stage probability UI. | covel-ai | 0.0.39 | Available | [Demo](https://github.com/covel-ai/covel-plugins/blob/main/examples/jev-choice-demo/README.md) | [Install source](https://github.com/covel-ai/covel-plugins/tree/main/examples/jev-choice-demo) |
| [MiMo Narration](https://github.com/covel-ai/covel-plugins) | Automatic and manual narration with a custom speech wire, background jobs, and an audio panel. | covel-ai | 0.0.39 | Available | [Demo](https://github.com/covel-ai/covel-plugins/blob/main/plugins/mimo-tts/README.md) | [Install source](https://github.com/covel-ai/covel-plugins/tree/main/plugins/mimo-tts) |
| [OpenAI Images](https://github.com/covel-ai/covel-plugins) | Generates story illustrations through the OpenAI-compatible image pipeline and displays a gallery. | covel-ai | 0.0.39 | Available | [Demo](https://github.com/covel-ai/covel-plugins/blob/main/plugins/openai-image-gen/README.md) | [Install source](https://github.com/covel-ai/covel-plugins/tree/main/plugins/openai-image-gen) |

### Community plugins

| Plugin | Description | Author | Covel version | Status | Demo | Install source |
| --- | --- | --- | --- | --- | --- | --- |
| [Anti-AI-Flavor](https://github.com/charlesli1989/anti-ai-flavor) | Adds configurable narrative style constraints for English and Chinese sessions. | charlesli1989 | Not confirmed | Pending review | — | [Source](https://github.com/charlesli1989/anti-ai-flavor) |
<!-- registry:end -->

Pending entries track submissions awaiting confirmation and are not installation recommendations. Archived entries are no longer maintained.

## Installation

In a Covel version that supports GitHub installation, open **Settings → Plugins → Install & manage**, paste an install source link, review the plugin version and risks, and confirm installation. Repository links discover packages in `plugins/`, `examples/`, and other subdirectories. Select and install each desired package separately, reviewing its risks each time. You can also paste a `/tree/main/plugins` link to limit discovery, or a direct package link to select one plugin. Restart the backend, then enable the plugin and approve its code in your session.

- A repository link resolves to a fixed commit on its default branch. Use `/tree/<tag-or-commit>/<path>` to select a version and package directory.
- Encode `/` inside a branch name as `%2F` in the ref segment, or use a commit SHA.
- GitHub installation supports directly runnable plugins in public repositories. It does not install dependencies, build code, or run lifecycle scripts. Release assets can be downloaded separately and imported as a local ZIP.
- A ZIP must contain `package.json` and `PLUGIN.md`, or `runtimes/<name>/PLUGIN.md`, at its root without an extra wrapper directory.
- On older Covel versions, copy the plugin directory to `~/.covel/plugins/<id>` and restart. Custom deployments may use a different plugin directory.
- GitHub metadata requests and downloads follow Covel's network proxy settings, including system, HTTP(S), and SOCKS5 proxies.
- Desktop installation writes to the local backend. When connected to a remote server, installation writes to that backend and requires administrator access.

For installed plugins, use **Check for updates** in settings. Branch installations track their branch; tag/commit installations stay pinned until you choose another version URL. Review changed files and confirm; the update is staged until the next backend restart. Local package edits block replacement, and code execution requires fresh approval after restart.

## Trust and risks

**Directory inclusion does not constitute a security audit or grant builtin privileges.** Plugin server-side JavaScript does not run in a process sandbox. Once approved, it may access files, environment variables, and networks available to the backend process. Prompt-only plugins can also affect model behavior, the data sent to models, and usage costs. Install only authors and versions you trust.

The directory does not host or execute submitted third-party code. Demos currently use documentation, screenshots, or recordings; any future hosted demos would be selected and deployed separately by the official team.

## Contributing

See the [contribution guide](CONTRIBUTING.md), [security policy](SECURITY.md), [publishing contract](docs/publishing.md), [Story Note example](examples/story-note/README.md), and [advanced Jev example](examples/jev-choice-demo/README.md). These guides and the [official plugin READMEs](plugins/README.md) are available in English and Simplified Chinese, with English as the default.

Directory checks require no dependency installation:

```sh
node scripts/registry.mjs          # Generate navigation and all README tables
node scripts/registry.mjs --check  # Validate entries and generated output
node --test scripts/registry.test.mjs
```

For official plugin development, use Node 26+ and pnpm 11.22, then run `pnpm install --frozen-lockfile` and `pnpm test`. Jev includes bundled Zod; after updating that dependency, run `pnpm build:vendor` and commit the generated artifact and license. Directory CI performs static checks without executing submitted plugin code. Maintainers run the full tests locally after reviewing changes.

The authoring skill lives at [`.agents/skills/create-plugin/SKILL.md`](.agents/skills/create-plugin/SKILL.md). Agents that discover this directory can use `$create-plugin`.

To translate documentation or add a homepage language, see [Localization](docs/localization.md). Documentation languages are independent of the languages supported by a plugin.

JSON entries are the single index source and can later power a website or in-app directory. Automatic updates, ratings, accounts, and online execution are not currently provided.

## License

Original documentation, tools, and examples use [MIT](LICENSE). Listed third-party plugins retain their authors' licenses; directory inclusion does not change their licensing.
