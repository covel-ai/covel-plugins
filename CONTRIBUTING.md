# Contributing plugins

**English** · [简体中文](CONTRIBUTING.zh-CN.md)

1. Publish a runnable plugin in your public GitHub repository with a README, an explicit license, supported Covel versions, and contact information.
2. Document functionality, setup, data access, network requests, server-side code, model costs, and known limitations. Screenshots, recordings, or documentation links can serve as demos.
3. In the repository's About → Topics, add `covel-plugin` or `covel-plugins`. No listing PR or registry JSON is required.
4. Keep `PLUGIN.md` and `package.json` versions equal. Publish `<id>/v<version>` tags for subpackages; a root single-package repository can use `v<version>`. Do not move published tags.
5. Read the [publishing contract](docs/publishing.md). The next complete collection discovers the repository; missing or invalid metadata remains visible as pending.

The plugin ID must match its manifest identity and must not impersonate a builtin plugin. An author prefix is recommended. Use manifest tags such as narrative, gameplay, world, media, tools, or authoring for classification. Use standard locale identifiers for supported plugin languages. Declare license and Covel compatibility in the manifest; unknown fields are represented as null and incomplete packages remain pending automatically.

Keep English display text in the manifest and translated labels in `locales/<locale>.yaml` under `PLUGIN.md`. Missing fields fall back to the base text. The web UI uses the shared kit's labels, independently of package language support; see [Localization](docs/localization.md). Old registry JSON is migration history and should not be extended for new listings.

For documentation maintained in this repository, keep the default file in English and provide a Simplified Chinese sibling, such as `README.md` and `README.zh-CN.md`, with language links at the top. Update both versions together when changing installation, configuration, or behavior descriptions.

Maintainers review identity, licensing, feature descriptions, installable layout, and version information. Acceptance does not imply a line-by-line security audit. Authors maintain their code and releases; Covel maintains directory inclusion and removal decisions. Repository transfers, expanded permissions and archival are rechecked during collection/download. Report listing issues through GitHub Issues; maintainers can publish independent withdrawal rules.

Do not submit secrets, user saves, or private screenshots. Do not copy complete third-party source trees into this repository. Offline PR checks validate fixtures and local manifests. Scheduled collection reads public repository metadata; download preparation reads files but never installs dependencies or executes submitted code. Maintainers should review script and example changes before running this repository's full test suite.
