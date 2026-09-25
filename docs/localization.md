# Localizing the plugin directory

English is the default homepage (`README.md`). Published translations use `README.<locale>.md`, such as `README.zh-CN.md`. Every homepage links to all published languages and lists official plugins before community plugins.

## Add a homepage language

1. Copy an existing README to `README.<locale>.md` and translate its prose and quick-link anchors. Keep exactly one pair of each generated marker: `<!-- languages:start -->` / `<!-- languages:end -->` and `<!-- registry:start -->` / `<!-- registry:end -->`.
2. Add an entry to `registry/locales.json`, copying an existing entry and translating its labels. Set `locale`, the native language `label`, and the matching `readme` filename. English must stay first. Locale identifiers support a language, optional script, and optional region, for example `ja`, `pt-BR`, and `zh-Hant-TW`.
3. Add optional entry translations in `registry/plugins/*.json`:

```json
{
  "name": "Story Notes",
  "description": "Adds narrative guidance.",
  "translations": {
    "zh-CN": {
      "name": "故事便笺",
      "description": "添加叙事建议。"
    }
  }
}
```

This is an excerpt, not a complete registry entry. `translations` may contain `name`, `description`, and `notes`; each missing field falls back to the English base field. `notes` remains metadata for reviewers and future consumers and is not currently shown in README tables. Do not add `en-US` to `translations`; edit the base fields instead. Plugin IDs, paths, versions, authors, and URLs remain shared across languages.

4. Run these commands from the repository root:

```sh
node scripts/registry.mjs
node scripts/registry.mjs --check
node --test scripts/registry.test.mjs
```

Commit the locale configuration, translated prose, entry translations, and generated README changes together. Only add navigation for a README that exists and has translated prose; missing plugin labels can fall back to English. Do not edit the generated sections by hand. CI checks every configured README for stale navigation and tables.

## Plugin languages are separate

An entry's `locales` field describes languages supported by the plugin itself. Adding a homepage translation does not claim that the plugin supports that language. Individual plugin READMEs and manifests can be translated separately.
