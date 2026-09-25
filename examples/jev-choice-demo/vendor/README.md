# Bundled dependency

Zod 4.4.3 is bundled for direct installation without npm dependencies. See ZOD-LICENSE (MIT). The plugin schemas remain readable in `server.js` and `recommendation-schema.js`. From the repository root, run `pnpm install --frozen-lockfile` and `pnpm build:vendor`; verify with `node scripts/build-vendor.mjs --check`. Do not hand-edit zod.js.
