# Plugin publishing contract

**English** · [简体中文](publishing.zh-CN.md)

A plugin package needs `package.json` (`name`, `version`, and `type: module`) and a root `PLUGIN.md` whose `id` matches the package directory. A single runtime is declared inline under `runtime:`; multiple runtimes live in `runtimes/<id>/RUNTIME.md`. Child `PLUGIN.md` files and the old flat manifest fields are rejected by Covel 0.0.50. `version` in `PLUGIN.md` must equal `version` in `package.json`, and `covel: ">=0.0.50"` declares the host range: a host outside it refuses to install or load the package. The package name may omit the `plugin-` prefix.

JavaScript in the published directory must be directly runnable and self-contained. Keep development tools in `devDependencies`. A `package.json` intended for automatic GitHub installation must not retain `dependencies`, `optionalDependencies`, or `peerDependencies`. Authors whose plugins need these dependencies should bundle them into a standalone release directory and link to that directory. Do not rely on Covel monorepo workspace resolution. The installer does not execute scripts.

Manifests and their language variants accept only ordinary YAML frontmatter; executable language tags are forbidden. GitHub resolution and downloads use Covel's configured network proxy.

Source archives are limited to 20 MiB compressed, 200 MiB extracted, and 2,000 entries. If the repository is too large, provide a smaller release repository or use local ZIP installation. Symbolic links, path traversal, and duplicate paths are rejected. Multiple runtimes within a package subdirectory are installed together as one package.

An installation preview pins a Git commit and file digest and remains valid for 15 minutes. Installation fetches that commit again and verifies the digest; directory changes or an expired preview require confirmation again. Ordinary installation does not overwrite a plugin with the same ID. Covel versions that support updates can check installed plugins, preview file changes, and download an update after confirmation. The update is staged until the next backend start, with rollback to the old package on failure. Separately stored session settings, plugin-data, and media are preserved, but authors must still document data compatibility in new versions. Locally added, deleted, or modified package files block updates; back up and resolve those changes first.

Declare versioned contracts (`provides`, `requires`, `optional`, `conflicts`), `io.visibility`, and `contributes` entries that match the entry registrations. Do not extend the framework with branches tied to specific plugin IDs. Authors declare supported versions. The installer validates the manifest contract; version text alone does not prove compatibility. Before listing a version, run `COVEL_DIR=<covel checkout> pnpm check:covel` against a Covel checkout of that release; it runs Covel's static `validate:plugin` over every package here.

## Maintaining official plugins

Official plugins provide English manifests with Simplified Chinese labels in `locales/zh-CN.yaml`, English and Simplified Chinese READMEs covering installation, model configuration, data and network behavior, an MIT license, standalone JavaScript, regression tests, and discovery Topics. Use `README.md` as the default English entry and `README.zh-CN.md` for Chinese, with language links at the top. Keep both versions in sync; see [Localization](localization.md). Advanced authoring examples belong in `examples/`, optional features in `plugins/`, and framework primitives in the main Covel repository. When changing dependencies or bundled artifacts, verify that each package can be copied to a temporary directory and imported independently of this repository's or the main repository's `node_modules`.

Preserve plugin identities, setting keys, and the original Covel Contributors license. Each plugin maintains its own `package.json` version; the index's `covelVersion` describes host compatibility, not the plugin release version. Trust sources differ before and after installation, so existing sessions need renewed approval. If an older development copy is installed, back up your source edits, then uninstall and reinstall through settings. Do not overwrite installation records manually.

## Versions and update sources

Branch installations track that branch, and repository-root links track the default branch. Tag or commit installations stay pinned until the user supplies a new version link within the same repository and plugin directory. The installer detects changes using a digest of package contents. Changes to other plugins or the root README do not trigger an update for that package. Every installation or update still pins a single commit.

Maintain release notes for each plugin and use separate tags, such as `mimo-tts/v0.0.40`; do not move published tags. Encode `/` in tag names as `%2F` in installation links, for example `/tree/mimo-tts%2Fv0.0.40/plugins/mimo-tts`. The installer does not automatically find the next release tag; users select an upgrade through an explicit version link.

READMEs serve users and developers: explain functionality, installation and configuration, data and network behavior, limitations, and reproducible test commands. Keep dated manual acceptance records, personal test sessions, provider connection results, and timing logs out of plugin introductions.

## Automatic directory discovery

Add `covel-plugin` or `covel-plugins` to the public repository Topics. A collection reads package manifests; new entries need no JSON listing PR. ZIP downloads stay local/pinned unless Covel explicitly verifies and binds their source. See [catalog operations](catalog.md) for policy, counters, immutable version history and the client integration boundary.
