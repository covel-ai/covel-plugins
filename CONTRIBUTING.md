# Contributing plugins

**English** · [简体中文](CONTRIBUTING.zh-CN.md)

1. Publish a runnable plugin in your public GitHub repository with a README, an explicit license, supported Covel versions, and contact information.
2. Document functionality, setup, data access, network requests, server-side code, model costs, and known limitations. Screenshots, recordings, or documentation links can serve as demos.
3. Add `registry/plugins/<id>.json` following `registry/schema.json`. Use `community` for `maintainer`; only Covel maintainers assign `official` status.
4. Prefer a release tag or full commit for `ref`. Branches such as `main` are allowed during early development; installations still resolve to a fixed commit. Set `path` to the plugin package directory, not a file.
5. Run the generation, validation, and test commands in the README, then open a pull request.

The plugin ID must match its manifest identity and must not impersonate a builtin plugin. An author prefix is recommended. Choose a category from narrative, gameplay, world, media, tools, and authoring. Use standard locale identifiers for supported plugin languages. If a candidate's license or Covel compatibility is unknown, set the corresponding field to `null` and its status to `pending`, not `active`.

Write the base `name`, `description`, and `notes` in English. Optional `translations` provide localized fields, with missing fields falling back to English. README navigation and tables are generated together; see [Localization](docs/localization.md) to add a language. An entry's `locales` describe languages supported by the plugin, independently of homepage translations.

For documentation maintained in this repository, keep the default file in English and provide a Simplified Chinese sibling, such as `README.md` and `README.zh-CN.md`, with language links at the top. Update both versions together when changing installation, configuration, or behavior descriptions.

Maintainers review identity, licensing, feature descriptions, installable layout, and version information. Acceptance does not imply a line-by-line security audit. Authors maintain their code and releases; Covel maintains directory inclusion and removal decisions. Repository transfers, author changes, expanded permissions, and archival require an entry update and renewed review.

Do not submit secrets, user saves, or private screenshots. Do not copy complete third-party source trees into this repository. Directory CI checks metadata and generated content without downloading, installing, or executing submitted plugins. Maintainers should review script and example changes before running this repository's full test suite.
