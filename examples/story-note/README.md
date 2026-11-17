# Story Note

**English** · [简体中文](README.zh-CN.md)

A minimal official hook example for developers to copy and adapt. It declares one hook in `PLUGIN.md` (`contributes.hooks: [PostContextAssembly]`) and registers it in `server/index.js`. The handler appends a single suggestion to the system prompt of runtimes with `outputKind: story`, asking the narrator to leave room for the player to decide what happens next. The suggestion is an instruction, so it is Simplified Chinese in Simplified Chinese sessions (`ctx.locale`) and English in every other session. It does not rewrite generated results, read or write the store, make network requests, or call models directly. It adds a small number of input tokens.

## Installation and demo

In a Covel version that supports GitHub installation, paste:

```text
https://github.com/covel-ai/covel-plugins/tree/main/examples/story-note
```

For local development, you can also copy this directory to `story-note/` under your user plugin directory; the directory name is the plugin ID, so keep it `story-note`. Restart the backend, enable the plugin in your session, and approve its server-side code. The suggestion appears at the end of the narrative runtime's context trace; other runtimes' contexts remain unchanged.

The plugin is disabled by default. Official examples still require community code approval; confirming installation does not authorize execution. This example targets Covel `0.0.52` or later (`covel: ">=0.0.52"`). Version 0.3.0 writes the hook in its one-line form and leaves out `id`, `kind` and `entry`, which Covel 0.0.52 works out itself; the hook behaves as before. Version 0.2.0 changes the plugin ID from `example-story-note` to `story-note`; reinstall it and approve it again in existing sessions. Labels are English in `PLUGIN.md`, with the Chinese text in `locales/zh.yaml`.

Run from this package directory:

```sh
node --test tests/*.test.js
```

MIT; see [LICENSE](LICENSE).
