---
version: 0.2.0
covel: ">=0.0.54"
displayName: Jev Choice Recommendations Demo
description: >-
  Evaluates current quick replies and displays recommendation probabilities on
  stage; an example for plugin authors.
author:
  name: Covel Contributors
  url: https://github.com/covel-ai
license: MIT
homepage: https://github.com/covel-ai/covel-plugins/tree/main/examples/jev-choice-demo
requires:
  - narrative-engine@2
  - scene-prompts@1
entry: ./server.js
contributes:
  services:
    - jev-choice-demo.recommendation@1
  settings:
    - key: evaluationSlot
      type: slot
      default: evaluation
      label: Evaluation model role
      description: >-
        Choose a role bound to an evaluation model, such as evaluation or
        intent. Supports Jev and other evaluation models.
    - key: goal
      type: textarea
      label: Recommendation goal
      description: >-
        Optional. Describe what to prioritize; when empty, recommendations
        follow the player's latest intent and scene.
  ui:
    right:
      - ./ui/recommendations.json
runtime:
  description: >-
    Ranks the current suggested actions with an evaluation model and publishes
    the result to its own recommendations namespace.
  schedule:
    stage: post-turn
  io:
    inputs:
      choices:
        from: { contract: scene-prompts@1 }
        accepts: ./schemas/choices.schema.json
      narrative:
        from: { contract: narrative-engine@2 }
        select: /narrativeOutput
        accepts: ./schemas/narrative.schema.json
  function:
    timeoutMs: 15000
  effects:
    writes:
      - plugin-data:self:recommendations
---

This opt-in demo consumes typed inputs from the current execution, calls
a public `recommend` service (which calls `ctx.gateway.evaluate()` once) with a Choice question, and publishes only its own
`recommendations/current` record. It never chooses or sends a player action.

The model returns a distribution over the existing candidates, not a forecast of
action success. The selected evaluation role controls the provider, model and
protocol; the handler contains no Jev-specific HTTP code.
