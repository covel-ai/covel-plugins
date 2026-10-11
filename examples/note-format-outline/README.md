# Outline Note

**English** · [简体中文](README.zh-CN.md)

This official example is an entry-only processor for [Notes Workbench](../notes-workbench/README.md). Install this package separately from:

```text
https://github.com/covel-ai/covel-plugins/tree/main/examples/note-format-outline
```

The `main` link becomes installable after this example is merged and published. Install the workbench separately for its UI. Restart the backend, enable both packages in a session, approve their server-side code, open `/notes`, refresh processors, and select `Turn each nonblank line into one plain-text bullet without duplicate markers.`. Another plugin can call this service through the same public contract.

An entry-only provider of `examples.note-format@1`. Its `format-note` service accepts `{ "text": "..." }` with at most 4,000 UTF-16 code units before trimming (whitespace-only input is rejected) and returns nonblank `{ "text": "..." }` with at most 8,000 UTF-16 code units. Every nonblank input line becomes one `- ` bullet. Existing `-`, `*`, `+`, `•`, `‣`, `◦`, and numbered (`1.` or `1)`) prefixes followed by whitespace are replaced with one bullet. For example, `"One\n* Two\n\n3. 三"` becomes `"- One\n- Two\n- 三"`.

The service treats content as plain text. It does not interpret HTML or write caller data. It has zero runtimes and needs no model configuration, network, cache, timer, or paid service. The host may still require session code approval for its entry.

## Package layout

```text
PLUGIN.md          id, kind, version, covel, credits, contributes.services
locales/zh.yaml    Simplified Chinese name and description (locales/lock.json records the English they translate)
server/index.js    entry: registers the format-note service
server/format.js   the pure formatting function
tests/             node --test suites
```

`PLUGIN.md` holds English only and declares the service under `contributes.services`; the entry's registration and that declaration must match, or the host refuses to load the package. Service contract IDs use dots, not slashes (`examples.note-format@1`).

## Compatibility and validation

Requires Covel **0.0.50 or later** (`covel: ">=0.0.50"` in `PLUGIN.md`); an older host does not install or load it. Version 2.0.0 moves to the current package format and renames the contract from `examples/note-format@1` to `examples.note-format@1`; install it together with Notes Workbench 2.0.0 or later. Run `pnpm test` from this repository root. With a Covel checkout at `$COVEL_REPO`:

```sh
pnpm --dir "$COVEL_REPO" validate:plugin "$PWD/examples/note-format-outline"
```

MIT licensed; see [LICENSE](LICENSE).
