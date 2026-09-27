# Notes Workbench

**English** · [简体中文](README.zh-CN.md)

An official example of composing independent plugins through a public service contract. The workbench provides `/notes`, a bilingual HTML panel, and two manual function runtimes. It saves notes as written or through a processor selected by the user. It does not call a model, access the network, or advance a story turn.

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

These `main` links become installable after this example is merged and published. Each link installs one package; the GitHub installer does not install sibling packages. Restart the backend, enable the workbench and desired processors in the session, and approve their server-side code when prompted. Official maintenance does not grant builtin trust. The workbench alone can save unmodified text.

Enter `/notes` or open the plugin side panel. Type a note and choose **Save as written**, or select a processor after **Refresh processors**. A save commits only after formatting succeeds. If the selected processor is disabled, loses approval, times out, or returns invalid output, the draft remains and no note is created. Choose another processor or explicitly save as written. `/plugins notes-workbench` shows service activity without recording note bodies in diagnostics.

Draft text and the selected processor survive sidebar tab changes within the mounted session sidebar through the host’s temporary `uiState` cache. Refreshing the page or leaving the session clears that cache; only **Save note** persists a note. After returning to a processed draft, refresh processors to check availability again.

## How composition works

The workbench discovers active services under `examples/note-format@1`, then calls the selected plugin's `format-note` service. Input and output are `{ "text": "..." }`; input must contain nonblank text and have at most 4,000 UTF-16 code units, and output must contain nonblank text and have at most 8,000. The processor description appears in the dropdown. Another plugin can join by implementing the same contract without changing the workbench.

The workbench writes its own session-scoped `notes` plugin data only after a successful save. Each record contains an ID, original and saved text, selected provider ID (or `null`), and timestamp. Processors only return text and do not write this data. The panel renders note text with `textContent`; HTML in notes is displayed as text. The example has no model configuration, external network access, or model cost. It does not offer shared editing, background jobs, or rich text rendering.

## Compatibility and validation

This example targets the public service, manual runtime, and temporary webview UI state contracts on Covel's **development branch in [PR #86](https://github.com/ackness/covel/pull/86)** (host package version `0.0.40` at development time). Released-host compatibility has not been confirmed, so the directory entry remains pending. A package version alone does not establish host support.

From this repository root, run `pnpm test`. To validate against a compatible Covel checkout, set `COVEL_REPO` to its absolute path, then run:

```sh
pnpm --dir "$COVEL_REPO" validate:plugin "$PWD/examples/notes-workbench"
pnpm --dir "$COVEL_REPO" test:runtime notes-workbench/save \
  --plugins-dir "$PWD/examples" \
  --with-plugin note-format-clean \
  --payload '{"text":"  First line  \n\n\nSecond line  ","providerPluginId":"note-format-clean"}' \
  --pretty
```

The CLI run does not exercise GitHub installation, session approval, or the browser panel. Run those flows in a compatible host before treating it as a released integration. This package is MIT licensed; see [LICENSE](LICENSE).
