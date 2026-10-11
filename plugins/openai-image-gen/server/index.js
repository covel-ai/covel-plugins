import makeSubmitImagePromptTools from "../tools/submit-image-prompt.js";

const ENTRY_RUNTIME_ID = "openai-image-gen/prompt-generator";
const ASSET_RUNTIME_ID = "openai-image-gen/image-generator";

export default function (covel) {
  for (const imagePromptTool of makeSubmitImagePromptTools(covel.toolkit)) {
    covel.registerTool(imagePromptTool);
  }
  // Names the manual entry runtime and the runtime that produces the image
  // assets, so the host can offer its own "generate image" control and check
  // that a finished asset runtime returned assetGenerations[].
  covel.provideExtension("media.image-flow@1", "flow", {
    handler: () => ({
      entryRuntimeId: ENTRY_RUNTIME_ID,
      assetRuntimeIds: [ASSET_RUNTIME_ID],
    }),
  });
}
