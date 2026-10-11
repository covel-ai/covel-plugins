---
id: note-format-outline
kind: plugin
version: 2.0.0
covel: ">=0.0.50"
displayName: Outline Note
description: Turns nonblank lines into a plain-text bullet list without duplicate markers.
author:
  name: Covel Contributors
  url: https://github.com/covel-ai
license: MIT
homepage: https://github.com/covel-ai/covel-plugins/tree/main/examples/note-format-outline
entry: ./server/index.js
contributes:
  services:
    - examples.note-format@1
---

# Outline Note

Entry-only package with no runtime and no UI. Its entry registers the
`format-note` service under the `examples.note-format@1` contract: a pure
plain-text formatter that reads `{ text }` and returns `{ text }`. It does not
read or write session data, call a model, or use the network.
