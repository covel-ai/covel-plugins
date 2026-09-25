# Official examples

Use the runnable packages in this repository as the source of truth. Do not copy old wire implementations or numeric-priority manifests from historical snippets.

| Package                                                               | Demonstrates                                                                                                                        |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| [Story Note](../../../../examples/story-note/README.md)               | Small hook-only entry, story prompt extension, no dependencies                                                                      |
| [Jev Choice Demo](../../../../examples/jev-choice-demo/README.md)     | Typed upstream inputs, evaluation gateway, validated public service, capability-owned data, sandboxed stage/panel HTML, bundled Zod |
| [DashScope Images](../../../../plugins/dashscope-image-gen/README.md) | Manual prompt tools, event follower, background image pipeline, CDN download permissions, gallery                                   |
| [OpenAI Images](../../../../plugins/openai-image-gen/README.md)       | Compatible image providers, settings, image generation helpers, persisted MediaRefs                                                 |
| [MiMo TTS](../../../../plugins/mimo-tts/README.md)                    | Entry-registered speech wire, auto/manual runtimes, detached turn completion, cancellation, audio UI                                |

Each package has its own README, LICENSE, manifests and tests. Imports in an installable package stay inside that directory; helpers shared during authoring must be bundled or copied into each published package.

Core contract examples stay in [Covel's plugins directory](https://github.com/ackness/covel/tree/main/plugins), including scene-stage, scene-prompts, guide and dice-check. These paths are not local to this repository.
