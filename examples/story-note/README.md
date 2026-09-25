# Story Note

**English** · [简体中文](README.zh-CN.md)

A minimal official hook example for developers to copy and adapt. It appends a single English suggestion to the system prompt of runtimes with `outputKind: story`, asking the narrator to leave room for the player to decide what happens next. It does not rewrite generated results, read or write the store, make network requests, or call models directly. It adds a small number of input tokens.

## Installation and demo

In a Covel version that supports GitHub installation, paste:

```text
https://github.com/covel-ai/covel-plugins/tree/main/examples/story-note
```

For local development, you can also copy this directory to `example-story-note/` under your user plugin directory. Restart the backend, enable the plugin in your session, and approve its server-side code. The suggestion appears at the end of the narrative runtime's context trace; other runtimes' contexts remain unchanged.

The plugin is disabled by default. Official examples still require community code approval; confirming installation does not authorize execution. This example targets the public hook contract in Covel `0.0.39`.

Run from this package directory:

```sh
node --test tests/*.test.js
```

MIT; see [LICENSE](LICENSE).
