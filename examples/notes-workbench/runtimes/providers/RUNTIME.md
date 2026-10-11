---
type: function
description: List the note formatting services available to this session.
schedule:
  trigger:
    type: manual
  manual:
    execution: sync
io:
  visibility: plugin
function:
  handler: ./handler.js
  timeoutMs: 5000
effects:
  writes: []
---

Returns `value.providers`: the active `format-note` services of the
`examples.note-format@1` contract, sorted by plugin ID. It writes nothing.
