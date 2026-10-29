# Covel Plugins

<!-- languages:start -->
**English** · [简体中文](README.zh-CN.md)
<!-- languages:end -->

The official Covel plugin directory, optional extensions, and authoring examples. Community authors host their own code. Add `covel-plugin` or `covel-plugins` to the public repository’s GitHub Topics for automatic discovery.

Quick links: [Plugin directory](https://plugins.covel.cc/) · [World directory](https://worlds.covel.cc/) · [Installation](#installation) · [Contributing](#contributing)

## Plugin groups

| Group | Purpose | Maintained in |
| --- | --- | --- |
| Core plugins | Essential implementations for the default game flow and framework contracts | [Covel main repository](https://github.com/ackness/covel) |
| Official plugins | Optional features and examples maintained by the Covel team | This repository's `plugins/` and `examples/` directories |
| Community plugins | Third-party gameplay, narrative styles, and tools | Authors' repositories; this repository maintains the index |

Maintenance, feature category, and runtime trust are separate concepts. All externally installed plugins, including official ones, follow Covel's community code approval rules.

## Plugin directory

The [web directory](https://plugins.covel.cc/) supports search, official/community filters, versions, repository Stars and a shared ZIP download service. Its frontend and collection core are shared with [Covel Worlds](https://worlds.covel.cc/) through the independent [covel-catalog](https://github.com/covel-ai/covel-catalog) repository. Production publication requires a configured shared service; the local preview clearly identifies unavailable live features.

Topics are discovered every six hours and on main pushes/manual runs. Current `PLUGIN.md` and `package.json` are authoritative; new packages need no registry JSON or listing PR. `registry/plugins/` preserves migration notes only. Official identity comes from `catalog/config.json`, and independent policy rules can withdraw entries and downloads. [Architecture and operations](docs/catalog.md).

Pending entries have incomplete metadata. Indexed means metadata is complete, not a security or compatibility certification. Archived packages are filterable and unavailable for platform download.

## Installation

In a Covel version that supports GitHub installation, open **Settings → Plugins → Install & manage**, paste an install source link, review the plugin version and risks, and confirm installation. Repository links discover packages in `plugins/`, `examples/`, and other subdirectories. Select and install each desired package separately, reviewing its risks each time. You can also paste a `/tree/main/plugins` link to limit discovery, or a direct package link to select one plugin. Restart the backend, then enable the plugin and approve its code in your session.

- A repository link resolves to a fixed commit on its default branch. Use `/tree/<tag-or-commit>/<path>` to select a version and package directory.
- Encode `/` inside a branch name as `%2F` in the ref segment, or use a commit SHA.
- GitHub installation supports directly runnable plugins in public repositories. It does not install dependencies, build code, or run lifecycle scripts. Release assets can be downloaded separately and imported as a local ZIP.
- A ZIP must contain `package.json` and the root `PLUGIN.md` at its root, without an extra wrapper directory. Runtimes of a multi-runtime package sit in `runtimes/<id>/RUNTIME.md`.
- On older Covel versions, copy the plugin directory to `~/.covel/plugins/<id>` and restart. Custom deployments may use a different plugin directory.
- GitHub metadata requests and downloads follow Covel's network proxy settings, including system, HTTP(S), and SOCKS5 proxies.
- Desktop installation writes to the local backend. When connected to a remote server, installation writes to that backend and requires administrator access.

For installed plugins, use **Check for updates** in settings. Branch installations track their branch; tag/commit installations stay pinned until you choose another version URL. Review changed files and confirm; the update is staged until the next backend restart. Local package edits block replacement, and code execution requires fresh approval after restart.

## Trust and risks

**Directory inclusion does not constitute a security audit or grant builtin privileges.** Plugin server-side JavaScript does not run in a process sandbox. Once approved, it may access files, environment variables, and networks available to the backend process. Prompt-only plugins can also affect model behavior, the data sent to models, and usage costs. Install only authors and versions you trust.

The collection and download service never executes submitted third-party code. It may cache validated, immutable package ZIPs privately for download. Demos currently use documentation, screenshots, or recordings; any future hosted demos would be selected and deployed separately by the official team.

## Contributing

See the [contribution guide](CONTRIBUTING.md), [security policy](SECURITY.md), [publishing contract](docs/publishing.md), [Story Note example](examples/story-note/README.md), and [advanced Jev example](examples/jev-choice-demo/README.md). These guides and the [official plugin READMEs](plugins/README.md) are available in English and Simplified Chinese, with English as the default.

Use Node 26+ and pnpm 11.22:

```sh
pnpm install --frozen-lockfile
pnpm collect:local       # Real local manifests; no fabricated community data
pnpm test:catalog       # Shared contracts, adapters, service and fault cases
pnpm build:site
pnpm test:site          # Requires Playwright Chromium
pnpm test              # Existing official-plugin regression suite
```

Collection/build CI has read-only repository permissions. The Pages job is separate and runs only after a complete snapshot is accepted by the configured service. Failures retain the previous publication; checkpoints allow later runs to resume. See [consumer deployment instructions](docs/catalog.md).

The authoring skill lives at [`.agents/skills/create-plugin/SKILL.md`](.agents/skills/create-plugin/SKILL.md). Agents that discover this directory can use `$create-plugin`.

To translate documentation or add a homepage language, see [Localization](docs/localization.md). Documentation languages are independent of the languages supported by a plugin.

The registry update API defines trusted install locks and explicit version selection. Covel client integration is separate: downloading an offline ZIP leaves it local/pinned and does not automatically establish update tracking. Ratings, accounts and online execution are not provided.

## License

Original documentation, tools, and examples use [MIT](LICENSE). Listed third-party plugins retain their authors' licenses; directory inclusion does not change their licensing.
