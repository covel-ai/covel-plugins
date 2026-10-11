---
type: function
description: Automatically narrates each turn's story output as speech.
schedule:
  stage: post-turn
  trigger:
    type: auto
  # Engine-agnostic gate: runs only when the active narrative engine
  # (narrator or chat-mode-narrator) succeeded this turn.
  needs:
    - contract: narrative-engine@1
  # The turn does not wait for synthesis: the job is queued durably and runs
  # after the turn commits.
  completion:
    mode: detached
    maxQueueMs: 120000
    maxExecutionMs: 120000
    overlap: serial
    stalePolicy: reject
io:
  inputs:
    narrative:
      from:
        contract: narrative-engine@1
        cardinality: one
      select: /narrativeOutput
      required: false
  visibility: plugin
function:
  handler: ./handler.js
  # The default speech slot, read by the detached job's credential check.
  # The handler passes the `modelPresetId` setting to ctx.speech itself.
  model: mimo-tts
  timeoutMs: 90000
effects:
  reads: []
  writes:
    - "assets:*"
    - "media:*"
    - "plugin-data:self:tracks"
    - "plugin-data:self:message"
permissions:
  http:
    - origin: https://api.xiaomimimo.com
      methods: [POST]
    - origin: https://token-plan-cn.xiaomimimo.com
      methods: [POST]
---

A function runtime; nothing here reaches a model prompt. See `./handler.js`.

Every turn it records `{ turnId, text }` in the `message` namespace, keyed by
the turn ID, so the Speak button renders under that turn's story message, even
when the `enabled` setting is off. With `enabled` on it synthesizes the story
text through `ctx.speech.generate()` and writes the track to `tracks`; a failed
synthesis is stored as a `failed` track.
