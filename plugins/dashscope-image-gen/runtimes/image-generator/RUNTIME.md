---
type: function
description: >-
  Generates an illustration from the prepared scene brief and saves it to the
  gallery.
schedule:
  trigger:
    type: event
    topic: image.generate.requested
  manual:
    execution: background
io:
  visibility: plugin
function:
  handler: ./handler.js
  timeoutMs: 360000
permissions:
  http:
    - origin: https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com
      methods: [GET]
    - origin: https://dashscope-result-sh.oss-cn-shanghai.aliyuncs.com
      methods: [GET]
---

The image generator is an event-triggered background follower of
`prompt-generator`. It is not part of the stage DAG, so it declares no stage.

It reads `prompt` / `promptMode` from the `image.generate.requested` event (or
from the manual payload of a direct plugin-rpc call), checks that the
`modelPresetId` slot resolves to an image model, writes a pending gallery
record, and calls `ctx.images.generate()`. The framework's `dashscope-wan`
image wire submits and polls the DashScope task, converts the size separator,
strips `negative_prompt` where a model rejects it, clamps `n`, and stores the
result bytes in MediaStore. Each returned `MediaRef` becomes an `images`
record and an `assetGenerations[]` entry.

`permissions.http` lists the DashScope result-storage origins the wire
downloads images from. Add the result origins of other regions or proxy
services here.
