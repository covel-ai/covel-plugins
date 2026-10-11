---
id: note-format-clean
kind: plugin
version: 2.0.0
covel: ">=0.0.50"
displayName: Clean Note
description: Trims line whitespace and excess blank lines while preserving paragraphs.
author:
  name: Covel Contributors
  url: https://github.com/covel-ai
license: MIT
homepage: https://github.com/covel-ai/covel-plugins/tree/main/examples/note-format-clean
entry: ./server/index.js
contributes:
  services:
    - examples.note-format@1
---

# Clean Note

Entry-only package with no runtime and no UI. Its entry registers the
`format-note` service under the `examples.note-format@1` contract: a pure
plain-text formatter that reads `{ text }` and returns `{ text }`. It does not
read or write session data, call a model, or use the network.
