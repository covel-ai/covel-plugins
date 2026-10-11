---
type: function
description: Save a note as written, or format it through a selected provider first.
schedule:
  trigger:
    type: manual
  manual:
    execution: sync
io:
  payloadSchema: ./payload.schema.json
  visibility: plugin
function:
  handler: ./handler.js
  timeoutMs: 5000
effects:
  writes:
    - plugin-data:self:notes
---

Manual payload: `{ "text": "...", "providerPluginId": "optional-plugin-id" }`.
Returns `value.note`. The note is stored in the package's `notes` namespace
under a UUID key. A selected provider must be discoverable under the
`examples.note-format@1` contract and expose `format-note`; otherwise, or when
formatting fails, nothing is saved.
