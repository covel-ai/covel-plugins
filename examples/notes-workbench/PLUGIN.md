---
id: notes-workbench
kind: plugin
version: 2.0.0
covel: ">=0.0.50"
displayName: Notes Workbench
description: >-
  Save session notes and optionally format them through an active note
  formatter service.
tags:
  - "ui:right-panel"
  - "cost:function"
author:
  name: Covel Contributors
  url: https://github.com/covel-ai
license: MIT
homepage: https://github.com/covel-ai/covel-plugins/tree/main/examples/notes-workbench
entry: ./server/index.js
contributes:
  actions:
    - open-notes
  commands:
    - name: notes
      description: Open the notes panel.
      action: open-notes
  data:
    notes:
      schema: ./schemas/note.schema.json
      version: 1
      description: Notes saved by this plugin in the current session.
  ui:
    right:
      - ./ui/panel.json
---

# Notes Workbench

`/notes` opens the panel. Executable runtimes live under `runtimes/`: the
`providers` manual runtime lists active services implementing
`examples.note-format@1`, and the `save` manual runtime saves the raw text or
first calls the explicitly selected provider. A provider failure never saves a
partially formatted note. Neither runtime calls a model or uses the network.
