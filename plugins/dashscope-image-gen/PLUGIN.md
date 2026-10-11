---
id: dashscope-image-gen
kind: plugin
version: 0.1.0
covel: ">=0.0.50"
displayName: DashScope Images
description: >-
  Generates illustrations from the current story, useful when you want artwork
  for a scene.
tags:
  - "cost:llm"
  - "ui:right-panel"
author:
  name: Covel Contributors
  url: https://github.com/covel-ai
license: MIT
homepage: https://github.com/covel-ai/covel-plugins/tree/main/plugins/dashscope-image-gen
entry: ./server/index.js
contributes:
  tools:
    - submit-dashscope-text-prompt
    - submit-dashscope-structured-prompt
  extensions:
    - point: media.image-flow@1
      id: flow
  settings:
    - key: composition
      type: select
      default: comic-strip
      label: Composition
      description: >-
        Choose a single scene, or a comic page with several connected moments.
      options:
        - value: single-scene
          label: Single scene
        - value: comic-strip
          label: Comic strip
    - key: comicPanels
      type: select
      default: auto
      label: Comic panels
      description: >-
        Used for comic pages. Auto chooses the panel count from the story
        rhythm.
      options:
        - value: auto
          label: Auto 2-6
        - value: "2"
          label: 2 panels
        - value: "3"
          label: 3 panels
        - value: "4"
          label: 4 panels
        - value: "6"
          label: 6 panels
    - key: comicLayoutStyle
      type: select
      default: dynamic
      label: Comic layout
      description: >-
        Used for comic pages. Choose a tidy grid, dynamic panels, or one large
        lead image.
      options:
        - value: strict-grid
          label: Strict grid
        - value: dynamic
          label: Dynamic breakout
        - value: splash-led
          label: Splash-led
    - key: promptMode
      type: select
      default: text
      label: Image description style
      description: >-
        Simple description is easier; detailed description controls more
        visual details.
      options:
        - value: text
          label: Simple description
        - value: image-json
          label: Detailed description
    - key: modelPresetId
      type: slot
      default: image
      label: Service setup
      description: >-
        Choose the service setup used for image generation. Defaults to image.
    - key: imageSize
      type: text
      default: 1024x1024
      label: Size
      description: >-
        Image size. The default is square; you can also choose wide or tall
        sizes.
    - key: "n"
      type: number
      default: 1
      min: 1
      max: 6
      label: Images per click
      description: >-
        How many images to create per click. The qwen-image-3 series creates up
        to 6 at a time, wan2.6 / wan2.7 up to 4; older models create one.
    - key: requestTimeoutMs
      type: number
      default: 300000
      label: Wait limit
      description: >-
        Maximum wait for one generation, so an image task does not stay stuck.
    - key: quality
      type: text
      default: low
      label: Quality (optional)
      description: >-
        Defaults to low. The native DashScope wire does not send this field; it
        is display-only gallery metadata.
    - key: negativePrompt
      type: textarea
      default: "low quality, blurry, watermark, text, extra fingers, distorted anatomy"
      label: Things to avoid
      description: >-
        Write things you want the image to avoid, such as blur, watermarks, or
        extra fingers.
  ui:
    right:
      - ./runtimes/image-generator/ui/gallery.json
      - ./runtimes/image-generator/ui/jobs.json
      - ./runtimes/prompt-generator/ui/generate-button.json
---

DashScope Images turns the current story into an illustration in two steps.
The manual `prompt-generator` agent writes an image prompt and submits it with
one of the plugin's submission tools, which archive it under `prompts` and emit
`image.generate.requested`. The event-triggered `image-generator` function then
calls `ctx.images.generate()` and stores the returned media references in the
`images` gallery. The entry declares this flow through `media.image-flow@1`.
This root `PLUGIN.md` is metadata only; the runtimes live under `runtimes/`.
