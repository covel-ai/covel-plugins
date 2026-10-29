# Consumer workflow template

`pages.yml` is the canonical collection/publication sequence. Replace each
`__PLACEHOLDER__` when instantiating `.github/workflows/pages.yml` in a consumer.
The template is not itself an executable GitHub workflow.

| Placeholder | Worlds example |
| --- | --- |
| `__KIND__` | `worlds` |
| `__PACKAGE_MANAGER__` | `npm` |
| `__INSTALL_COMMAND__` | `npm ci --ignore-scripts` |
| `__TEST_COMMAND__` | `npm test` |
| `__COLLECT_COMMAND__` | `npm run collect` |
| `__GENERATE_COMMAND__` | `npm run generate` |
| `__BUILD_COMMAND__` | `npm run build:pages` |
| `__PUBLISH_COMMAND__` | `node vendor/catalog-kit/src/publish.mjs --catalog site/public/catalog.json --releases artifacts/releases.json --receipt artifacts/publish-receipt.json` |
| `__CONFIG_HASH_EXPRESSION__` | `hashFiles('catalog-kit.lock.json', 'catalog/config.json', 'scripts/world-adapter.mjs')` |

For pnpm, install the configured pnpm version before `setup-node` initializes its
cache. Include all adapter/legacy inputs in the config hash, and retain the unique
run ID/attempt cache suffix. Restore and save are separate; failed collections save
completed queue progress without publishing an incomplete snapshot.

Configure `CATALOG_API_URL` as an HTTPS service origin and `CATALOG_INGEST_TOKEN` as
the kind-scoped secret. The collector uses these for the shared public GitHub proxy;
the publisher uses them for authenticated ingestion. Neither goes into the browser
except the deliberately public API URL passed as `VITE_CATALOG_API`.

Without an API URL, build a labeled offline preview artifact and skip deployment.
With an API URL, any collection, validation, policy preflight or ingestion failure
must prevent Pages deployment. Only the separate Pages job has write permissions.
PR validation uses offline fixtures; any real GitHub smoke check is manual/separate.

The files under `dist` include a collection-time `/catalog.json` export. Current
policy and download eligibility always come from the shared API; a saved export
does not grant distribution permission or certify present repository availability.
