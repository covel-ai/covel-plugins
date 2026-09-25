/** A hook receives a scoped context followed by its event payload. */
export function addStoryNote(_ctx, payload) {
  if (payload.outputKind !== "story") return { action: "continue" };
  return {
    action: "continue",
    replace: {
      systemPrompt: `${payload.systemPrompt}\n\nLeave room for the player to decide the next action.`,
    },
  };
}

export default function register(covel) {
  covel.on("PostContextAssembly", addStoryNote);
}
