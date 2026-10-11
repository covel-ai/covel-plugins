---
id: mimo-tts
kind: plugin
version: 0.0.50
covel: ">=0.0.50"
displayName: MiMo TTS
description: Reads story text aloud, either automatically or one paragraph at a time.
tags:
  - "ui:right-panel"
  - "ui:message-block"
  - "ui:manual-action"
  - "cost:llm"
author:
  name: covel-ai
  url: https://github.com/covel-ai
license: MIT
homepage: https://github.com/covel-ai/covel-plugins/tree/main/plugins/mimo-tts
# Both runtimes read the story text of the active narrative engine, whichever
# plugin provides it (narrator or chat-mode-narrator).
requires:
  - narrative-engine@1
# Registers the MiMo speech wire (`mimo-tts/mimo`) with covel.registerWires().
entry: ./server/index.js
contributes:
  wires:
    - mimo
  settings:
    - key: enabled
      type: toggle
      default: true
      label: Auto narrate
      description: >-
        Creates narration automatically after each story turn. Turn it off to
        use the Speak button manually.
    - key: modelPresetId
      type: slot
      default: mimo-tts
      label: Service setup
      description: >-
        Choose the service setup used for narration. Defaults to mimo-tts.
    - key: voice
      type: text
      default: mimo_default
      label: Voice
      description: >-
        Choose the speaking voice. For custom voices, create one in the
        service console and enter its name here.
    - key: format
      type: select
      default: mp3
      label: Audio format
      description: >-
        Common audio formats are recommended so playback works directly.
      options:
        - { value: mp3, label: MP3 }
        - { value: wav, label: WAV }
    - key: maxChars
      type: integer
      default: 1500
      min: 100
      max: 4000
      label: Max characters per request
      description: >-
        Maximum text length for one narration. Longer text is shortened to
        avoid long waits.
    - key: requestTimeoutMs
      type: integer
      default: 90000
      min: 5000
      max: 600000
      label: Request timeout (ms)
      description: >-
        Maximum wait for one narration, so an audio task does not stay stuck.
  ui:
    right:
      - ./ui/audio-tab.json
    message:
      - ./ui/play-button.json
---

# MiMo TTS

This root file declares the package only. The two function runtimes live under
`runtimes/`:

- `mimo-tts/auto-narrate` (`auto`, stage `post-turn`, `completion.mode:
detached`, needs `narrative-engine@1`) records the text of the turn for the
  Speak button and, unless the `enabled` setting is off, synthesizes the turn's
  story text in a durable background job through `ctx.speech` and stores a
  track.
- `mimo-tts/manual-narrate` (`manual`, `manual.execution: background`) runs when
  the player clicks the Speak button under a story message; it reads the
  paragraph text from the button payload.

The entry module registers the MiMo speech wire. A model slot selects it with
`providerRequestMetadata = { speechWire = "mimo-tts/mimo" }`.

`ui/audio-tab.json` is the right-panel playlist of every track;
`ui/play-button.json` renders the Speak button under each story message.
