# Clean Note

**English** · [简体中文](README.zh-CN.md)

This official example is an entry-only processor for [Notes Workbench](../notes-workbench/README.md). Install this package separately from:

```text
https://github.com/covel-ai/covel-plugins/tree/main/examples/note-format-clean
```

The `main` link becomes installable after this example is merged and published. Install the workbench separately for its UI. Restart the backend, enable both packages in a session, approve their server-side code, open `/notes`, refresh processors, and select `Trim line whitespace and excess blank lines; preserve paragraphs.`. Another plugin can call this service through the same public contract.

An entry-only provider of `examples/note-format@1`. Its `format-note` service accepts `{ "text": "..." }` with at most 4,000 UTF-16 code units before trimming (whitespace-only input is rejected) and returns nonblank `{ "text": "..." }` with at most 8,000 UTF-16 code units. It normalizes CRLF and CR to LF, trims each line, and reduces multiple empty lines to one. For example, `"  One  \r\n\r\n\r\n Two "` becomes `"One\n\nTwo"`.

The service treats content as plain text. It does not interpret HTML or write caller data. It has zero runtimes and needs no model configuration, network, cache, timer, or paid service. The host may still require session code approval for its entry.

This example targets Covel's **[PR #86](https://github.com/ackness/covel/pull/86) development contract** (host package version `0.0.40` during development). Released-host compatibility remains unconfirmed. Run `pnpm test` from this repository root; see the workbench README for host validation commands. MIT licensed; see [LICENSE](LICENSE).
