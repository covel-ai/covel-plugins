import { translate } from "../lib/text.js";

export default function (covel) {
  covel.registerRpc("open-notes", async (_payload, ctx) => ({
    ok: true,
    message: translate(ctx, "Notes panel opened."),
    clientAction: {
      type: "open-plugin-panel",
      panelId: "notes-workbench",
    },
  }));
}
