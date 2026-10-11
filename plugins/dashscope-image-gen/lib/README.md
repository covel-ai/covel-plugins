# Covel helpers

`covel-helpers.js` contains the pure image-generation, proposal and tool-result helpers of the Covel 0.0.50 plugin SDK (`packages/plugin-handlers-utils/src/index.ts`, `image-generation.ts` and `tool-result.ts`; MIT, see the package LICENSE), with types removed and no workspace barrel imports. It is maintained here as directly runnable JavaScript, because a standalone plugin cannot depend on `@covel/plugin-handlers-utils`. Runtime imports must stay inside this plugin.

A tool result is the explicit object `{ kind: "covel.tool-result", content, pendingProposals, emittedEvents? }`, which the host recognizes by its `kind`. When the SDK source of these helpers changes, copy the change here and in the sibling image plugin.
