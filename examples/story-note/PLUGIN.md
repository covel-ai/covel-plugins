---
version: 0.3.0
covel: ">=0.0.52"
displayName: Story Note Example
description: Adds a short story note to demonstrate a community hook plugin.
author:
  name: Covel Contributors
  url: https://github.com/covel-ai
license: MIT
homepage: https://github.com/covel-ai/covel-plugins/tree/main/examples/story-note
contributes:
  hooks:
    - PostContextAssembly
---

# Story Note

An opt-in hook-only example with no runtime. Its `PostContextAssembly` handler
appends one note to the system prompt of runtimes whose `outputKind` is `story`
and leaves every other runtime unchanged. No store writes, network requests, or
direct model calls.
