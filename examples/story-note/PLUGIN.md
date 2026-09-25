---
name: example-story-note
displayName:
  zh: 叙事便签示例
  en: Story Note Example
description:
  zh: 为叙事提示词追加一句建议，演示社区 hook 插件。
  en: Adds a short story note to demonstrate a community hook plugin.
pluginType: plugin
outputKind: system
capabilities:
  - story-note-example
entry: ./server/index.js
---

# Story Note

An opt-in hook-only example. It adds a note to story prompts without modifying
other runtime kinds. No store writes, network requests, or direct model calls.
