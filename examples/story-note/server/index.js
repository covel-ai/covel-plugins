const NOTE = {
  en: "Leave room for the player to decide the next action.",
  zh: "给玩家留出决定下一步行动的空间。",
};

/**
 * The note is an instruction to the model, so it follows the instruction
 * language: Simplified Chinese sessions read Chinese, every other locale
 * (Traditional Chinese included) reads English.
 */
export function noteFor(locale) {
  try {
    const tag = new Intl.Locale(String(locale)).maximize();
    return tag.language === "zh" && tag.script === "Hans" ? NOTE.zh : NOTE.en;
  } catch {
    return NOTE.en;
  }
}

/**
 * A hook receives a scoped context followed by a private copy of its event
 * payload; a rewrite is returned in `replace`.
 */
export function addStoryNote(ctx, payload) {
  if (payload.outputKind !== "story") return { action: "continue" };
  return {
    action: "continue",
    replace: {
      systemPrompt: `${payload.systemPrompt}\n\n${noteFor(ctx?.locale)}`,
    },
  };
}

/** @param {import('@covel/plugin-handlers-utils').PluginAPI} covel */
export default function register(covel) {
  covel.on("PostContextAssembly", addStoryNote, { enforce: "normal" });
}
