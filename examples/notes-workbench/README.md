# Notes Workbench

**English** · [简体中文](README.zh-CN.md)

An official example of composing independent plugins through a public service contract. The workbench provides `/notes`, an HTML panel in English and Simplified Chinese, and two manual function runtimes. It saves notes as written or through a processor selected by the user. It does not call a model, access the network, or advance a story turn.

## Install and use

Install this package from its own GitHub directory:

```text
https://github.com/covel-ai/covel-plugins/tree/main/examples/notes-workbench
```

To try both processors, install each separately:

```text
https://github.com/covel-ai/covel-plugins/tree/main/examples/note-format-clean
https://github.com/covel-ai/covel-plugins/tree/main/examples/note-format-outline
```

These `main` links become installable after this example is merged and published. Each link installs one package; the GitHub installer does not install sibling packages. Restart the backend (or let a development server reload it), enable the workbench and desired processors in the session, and approve their server-side code when prompted. Official maintenance does not grant builtin trust. The workbench alone can save unmodified text.

Enter `/notes` or open the plugin side panel. Type a note and choose **Save as written**, or select a processor after **Refresh processors**. A save commits only after formatting succeeds. If the selected processor is disabled, loses approval, times out, or returns invalid output, the draft remains and no note is created. Choose another processor or explicitly save as written. `/plugins notes-workbench` shows service activity without recording note bodies in diagnostics.

Draft text and the selected processor survive sidebar tab changes within the mounted session sidebar through the host’s temporary `uiState` cache. Refreshing the page or leaving the session clears that cache; only **Save note** persists a note. After returning to a processed draft, refresh processors to check availability again.

## How composition works

The workbench discovers active services under `examples.note-format@1`, then calls the selected plugin's `format-note` service. Input and output are `{ "text": "..." }`; input must contain nonblank text and have at most 4,000 UTF-16 code units, and output must contain nonblank text and have at most 8,000. The processor description appears in the dropdown. Another plugin can join by implementing the same contract without changing the workbench.

The workbench writes its own session-scoped `notes` plugin data only after a successful save. Each record contains an ID, original and saved text, selected provider ID (or `null`), and timestamp. Processors only return text and do not write this data. The panel renders note text with `textContent`; HTML in notes is displayed as text. The example has no model configuration, external network access, or model cost. It does not offer shared editing, background jobs, or rich text rendering.

## Package layout

```text
PLUGIN.md                      id, kind, version, covel, credits, entry, contributes
locales/zh.yaml                Simplified Chinese labels and messages; lock.json records the English they translate
server/index.js                entry: registers the open-notes action behind /notes
lib/                           the service contract name and the translate helper
runtimes/providers/RUNTIME.md  manual function runtime: lists formatter services
runtimes/save/RUNTIME.md       manual function runtime: formats and saves a note
runtimes/save/payload.schema.json   activation payload schema (io.payloadSchema)
schemas/note.schema.json       record schema of the notes namespace
ui/panel.json                  right-panel spec (English; translated through locales)
ui/workbench.html              sandboxed webview panel
tests/                         node --test suites
```

- `PLUGIN.md` declares the package-level contributions: `actions: [open-notes]`, the `notes` command that calls it, the `notes` data namespace and the right-panel UI. The entry's registrations and these declarations must match in both directions, or the host refuses to load the package.
- Each runtime is a `type: function` manual runtime (`schedule.trigger.type: manual`, `schedule.manual.execution: sync`, `io.visibility: plugin`). The host checks the `save` payload against `io.payloadSchema` before the handler runs, and the handler checks it again.
- Manifests, the UI spec and code hold English. Chinese labels go in `locales/zh.yaml` under the manifest file they translate; text from code and the panel name go under `messages` and reach code as `ctx.messages` (read through `lib/text.js`, a dependency-free copy of the SDK's `translate`).
- The host passes no translations into the sandboxed HTML document, so `ui/workbench.html` carries its own English and Simplified Chinese text and picks one from the `locale` the bridge sends; Traditional Chinese and other locales read English. It colours itself with the host's `--covel-*` theme variables.

## Compatibility and validation

Requires Covel **0.0.50 or later** (`covel: ">=0.0.50"` in `PLUGIN.md`); an older host does not install or load it. Version 2.0.0 moves to the current package layout (`runtimes/<id>/RUNTIME.md`, `contributes`, locale files) and renames the service contract from `examples/note-format@1` to `examples.note-format@1`, because contract IDs may not contain slashes. Use it with Clean Note and Outline Note 2.0.0 or later; notes saved by 1.x keep the same record shape.

From this repository root, run `pnpm test`. To validate against a Covel checkout, set `COVEL_REPO` to its absolute path, then run:

```sh
for id in notes-workbench note-format-clean note-format-outline; do
  pnpm --dir "$COVEL_REPO" validate:plugin "$PWD/examples/$id"
done
pnpm --dir "$COVEL_REPO" test:runtime notes-workbench/save \
  --plugins-dir "$PWD/examples" \
  --with-plugin note-format-clean \
  --payload '{"text":"  First line  \n\n\nSecond line  ","providerPluginId":"note-format-clean"}' \
  --pretty
```

The CLI run executes the runtime and the selected provider's entry in a mock session; it does not exercise GitHub installation, session approval, or the browser panel. Run those flows in a Covel 0.0.50 host before treating it as a released integration. This package is MIT licensed; see [LICENSE](LICENSE).
