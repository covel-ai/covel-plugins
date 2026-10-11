---
type: function
description: >-
  Generates an illustration from the prepared scene brief and saves it to the
  gallery.
schedule:
  trigger:
    type: event
    topic: openai-image.generate.requested
  manual:
    execution: background
io:
  visibility: plugin
function:
  handler: ./handler.js
  timeoutMs: 360000
---

The image generator is an event-triggered background follower of
`prompt-generator`. It is not part of the stage DAG, so it declares no stage.

It reads `prompt` / `promptMode` / `composition` from the
`openai-image.generate.requested` event (or from the manual payload of a direct
plugin-rpc call), checks that the `modelPresetId` slot resolves to an image
model, writes a pending gallery record, and calls `ctx.images.generate()`. The
framework's `openai-images` wire sends the request and stores the returned
bytes in MediaStore. The handler normalizes the size to the `1024x1024` form
and folds the optional `style` setting into the prompt. Each returned
`MediaRef` becomes an `images` record and an `assetGenerations[]` entry.

The runtime declares no `permissions.http`: GPT Image returns image bytes. A
compatible service that returns only image URLs needs its download origins
listed here.
