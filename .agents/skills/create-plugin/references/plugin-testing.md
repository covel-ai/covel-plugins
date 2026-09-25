# Plugin validation

## Standalone repository

From the community repository root, use Node 26+ and pnpm 11.22:

```sh
pnpm install --frozen-lockfile
node scripts/registry.mjs --check
pnpm test
node scripts/build-vendor.mjs --check
```

To run one official package's tests:

```sh
pnpm exec vitest run plugins/mimo-tts/tests
pnpm exec vitest run examples/jev-choice-demo/tests
```

Tests must run against the published JavaScript, not an unbundled source variant. Mock model/network responses; do not require API keys. Cover meaningful boundaries: input validation, cancellation, unavailable configuration, emitted events/proposals, media records, and custom wire HTTP shapes.

`test-support/toolkit.js` is a host contract fixture, not the real host. Test the current Covel version separately when changing a public-contract interaction. The standalone package test also copies each package outside the repository and imports runtime modules to catch accidental workspace dependencies.

## Validation against a Covel checkout

`validate:plugin`, `test:runtime`, and browser E2E commands belong to the Covel main repository. Set `COVEL_REPO` to that checkout. Run the following from the community repository root:

```sh
pnpm --dir "$COVEL_REPO" validate:plugin "$PWD/plugins/mimo-tts"
pnpm --dir "$COVEL_REPO" test:runtime mimo-tts --plugins-dir "$PWD/plugins" --pretty
```

The first checks every root/sub-runtime manifest against the current schema. The second runs package `tests/runtime-cases.json` fixtures using the public runtime debugger. Cases marked live need explicitly configured providers and can incur cost; choose mock cases for routine checks. A passing manifest does not establish that entry registration, tool output, model roles, or browser UI work.

Before moving a bundled plugin, inspect main-repository world/preset references, runtime discovery and golden schedules, tests importing its source, packaging scripts, and documentation links. The main repository must pass its checks without the community repository present. Keep synthetic framework fixtures in the main repository; keep the real plugin and its behavior tests here. Test external discovery, installation validation, session approval and registration with the real package before publishing a migration.

## Installation and UI

Copy/install only the package directory, not the whole repository. Confirm preview is inert, risk consent is required, installation needs no npm/build step, restart discovers the package, and a session must approve its code. Check both panel and stage surfaces when declared; results must respect the current turn and remain sandboxed. Verify server-backed actions through the host bridge.

Record executed checks, live services not tested, and any skipped infrastructure checks. Do not claim a unit test proves live provider compatibility.
