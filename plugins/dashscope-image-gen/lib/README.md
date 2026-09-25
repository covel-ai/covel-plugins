# Covel helpers

`covel-helpers.js` contains the pure image-generation, proposal and tool-result helpers from Covel commit `b81670e0` (MIT; see the package LICENSE), with types removed and no workspace barrel imports. It is maintained here as directly runnable JavaScript. Runtime imports must stay inside this plugin. The shared tool-result symbols use `Symbol.for` so the host recognizes emitted events and proposals.
