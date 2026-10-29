# Localizing the plugin directory

**English** · [简体中文](localization.zh-CN.md)

English is the default homepage (`README.md`). Published translations use `README.<locale>.md`, such as `README.zh-CN.md`. Every homepage links to all published languages and links to the searchable web directory.

## Documentation and plugin READMEs

The same English-first convention applies to repository guides and plugin documentation: keep English in the unsuffixed file, and Simplified Chinese in a sibling with the `.zh-CN.md` suffix. For example, use `SECURITY.md` / `SECURITY.zh-CN.md`, `docs/publishing.md` / `docs/publishing.zh-CN.md`, and `plugins/<id>/README.md` / `plugins/<id>/README.zh-CN.md`.

Add a language switch immediately below the title, with English first:

```md
**English** · [简体中文](README.zh-CN.md)
```

In the Chinese file, use `[English](README.md) · **简体中文**`. Adjust filenames for guides other than README. Link to the same-language version of another local guide when available; otherwise use its default English file. Shared registry demo URLs continue to open the default English README, where readers can switch languages.

Translate the full instructions, including setup, settings, permissions, costs, limitations, and tests. Keep identifiers, configuration keys and values, commands, and API shapes unchanged; write code comments in English. Update both versions together when behavior or configuration changes. These are manually maintained document pairs; only the root README language navigation is generated.

`PLUGIN.md` and `RUNTIME.md` files are executable manifests and may contain agent prompts. Do not create translated manifests or alter prompts merely to translate a README. Manifests, UI specs and code are written in English; label and UI-text translations live in the package's `locales/<locale>.yaml`, and the only prompt variant Covel reads is Simplified Chinese (`PLUGIN.zh.md` / `RUNTIME.zh.md`). See Covel's [i18n reference](https://github.com/ackness/covel/blob/v0.0.50/docs/reference/i18n.md). Documentation translation does not change runtime behavior or plugin language support.

## Add a homepage language

1. Copy an existing README to `README.<locale>.md` and translate its prose and quick-link anchors. Keep exactly one pair of each generated marker: `<!-- languages:start -->` / `<!-- languages:end -->`.
2. Add an entry to `registry/locales.json`, copying an existing entry and translating its labels. Set `locale`, the native language `label`, and the matching `readme` filename. English must stay first. Locale identifiers support a language, optional script, and optional region, for example `ja`, `pt-BR`, and `zh-Hant-TW`.
3. Package display translations come from the package's `locales/<locale>.yaml` under `PLUGIN.md` (for example `displayName` and `description`). Do not add new registry JSON to translate a listing. The shared website's interface labels live in [covel-catalog UI](https://github.com/covel-ai/covel-catalog/blob/main/packages/catalog-kit/ui/catalog-app.tsx) and are consumed by both sites.

4. Run these commands from the repository root:

```sh
node scripts/registry.mjs
node scripts/registry.mjs --check
node --test scripts/registry.test.mjs
```

Commit the locale configuration, translated prose, package label translations, and generated README navigation together. Only add navigation for a README that exists and has translated prose; missing plugin labels can fall back to English. Do not edit the generated sections by hand. CI checks every configured README for stale language navigation.

## Plugin languages are separate

An entry's `locales` field describes languages supported by the plugin itself. Adding a homepage or plugin README translation does not claim that the plugin supports that language. Manifest and prompt localization is a separate runtime change.
