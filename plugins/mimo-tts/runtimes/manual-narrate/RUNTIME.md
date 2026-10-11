---
type: function
description: Generates speech for the current passage when the Speak button is clicked.
# No `io.inputs` on purpose: a manual activation resolves no turn input
# bindings, so the paragraph text arrives only through the Speak button's
# payload, whose $state bindings read `turnId` and `text` from the
# message-namespace record auto-narrate writes each turn.
schedule:
  trigger:
    type: manual
  manual:
    execution: background
io:
  visibility: plugin
function:
  handler: ./handler.js
  # The default speech slot, read by the background job's credential check.
  model: mimo-tts
  timeoutMs: 120000
effects:
  reads: []
  writes:
    - "assets:*"
    - "media:*"
    - "plugin-data:self:tracks"
permissions:
  http:
    - origin: https://api.xiaomimimo.com
      methods: [POST]
    - origin: https://token-plan-cn.xiaomimimo.com
      methods: [POST]
---

A function runtime; nothing here reaches a model prompt. See `./handler.js`.

The Speak button (`ui/play-button.json`) sits under each story message. The
message layer renders it only for a turn that has a record in the `message`
namespace; auto-narrate writes one every turn. The button sends that record's
`turnId` and `text` as the payload of this runtime.
