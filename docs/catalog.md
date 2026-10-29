# Catalog architecture and operations

**English** · [简体中文](catalog.zh-CN.md)

Plugins and Worlds consume one implementation from [covel-catalog](https://github.com/covel-ai/covel-catalog). This repository keeps plugin content, collection configuration and a thin site entry. The API, adapters, shared UI, protocols and deployment files belong to the independent catalog repository. Both consumers pin an exact commit with a full SHA256 manifest; CI rejects modified, missing or extra vendor files. Shared changes are reviewed in covel-catalog before upgrading both consumers. Each Pages workflow is checked against the same vendored template.

## Production Cloudflare deployment (2026-10-29)

Production uses `https://api.covel.cc` from [covel-catalog-cloudflare](https://github.com/covel-ai/covel-catalog-cloudflare), with Workers, D1 and private R2. Its trusted Actions runner owns collection, checkpoints and ingestion for both directories. The Node deployment and combined collection workflow described below remain available for other deployments; they are not the active production pipeline.

The active consumer workflow is **Publish site with Cloudflare catalog** (`.github/workflows/site.yml`): push to main or dispatch, validate the pinned kit, check the current API policy/catalog, build with `VITE_CATALOG_API`, then deploy the static shell. Configure repository **variable** `DIRECTORY_API_URL=https://api.covel.cc`. This consumer needs no catalog write token or Cloudflare credential. Local fixture `catalog.json` is excluded from the production artifact; the browser reads paginated live API summaries.

Keep the legacy **Collect plugins and publish Pages** (`pages.yml`) workflow disabled in GitHub Actions and its `CATALOG_API_URL` variable unset. It uses the Node-only proxy and must not run against Cloudflare. Do not enable both pipelines. The shared legacy template remains byte-checked for consumers choosing the Node backend.

Until custom-domain ownership and DNS are verified, `DIRECTORY_SITE_URL` and `DIRECTORY_SIBLING_URL` point to the two `https://covel-ai.github.io/covel-*/` project URLs. After binding both custom domains, delete those two optional repository variables and dispatch `site.yml` in both repositories to restore the source defaults.

Pages uses the GitHub Actions source and custom domain `plugins.covel.cc`. Set its DNS-only CNAME to `covel-ai.github.io`, then enable HTTPS enforcement after certificate issuance. To restore a previous site, revert the relevant site change and push main (or dispatch at that reviewed main revision); do not roll back the independent API policy or append-only version history. Collection/rule operations and D1/R2 recovery belong to the Cloudflare deployment repository.

## Discovery and migration

Add either `covel-plugin` or `covel-plugins` to a public repository's About → Topics. Each collection searches both, deduplicates numeric repository IDs, rechecks membership, and reads manifests from a fixed commit. No listing PR or registry JSON is needed. A repository without a usable manifest remains pending; a malformed sibling does not hide valid packages. Official identity comes only from `catalog/config.json`. Removing both topics removes automatically discovered entries; configured migration seeds remain exceptions while public. Archived packages are hidden by default and cannot be downloaded through the platform.

`registry/plugins/` is frozen migration input. Its old compatibility claims and notes are retained as `legacyMetadata`, without overriding current package manifests. Category may use a legacy fallback. New authors should use manifest tags and package translations. The README no longer generates package tables.

Network failures, incomplete GitHub search, truncated trees and exhausted API budgets fail the run. `.cache/round/` records completed repositories and release refs so subsequent runs advance; `.cache/github/` accelerates requests. Six hours is the trigger interval, not a full-crawl completion guarantee. No partial snapshot is published. A successful local save acknowledges the collection round; if later service ingestion fails, the next run starts another round while the old publication remains available.

## Versions and downloads

The ledger separates observed refs/commit SHAs, package revisions and ZIP artifacts. Git tree fingerprints are cheap change detectors; byte hashes are calculated only after reading all package files. `covel-package-v1` sorts UTF-8 paths and hashes exact bytes and executable modes. It does not rewrite line endings. This algorithm has not been declared equivalent to the main Covel installer's digest.

Development snapshots can reuse a declared version with different content. Formal versions cannot silently change content or move tags: conflicts are recorded and the original revision is retained. A new commit with unchanged package files adds a source observation, not a package update. SemVer build metadata does not make a higher version. Package path moves create different identities.

Only positively bound tags become formal observations: root single-package repositories use `v<version>` or `<version>`; subpackages use `<id>/v<version>` or `<path>/v<version>`. An unrelated repository tag cannot release every package. Tags are an observed set, not a claim of complete Git history. Package publication dates remain unknown without package-specific evidence; the UI uses first-indexed/content-change time instead of repository activity.

Downloads contain the selected package at ZIP root. The gateway verifies current public repository identity, exact commit, tree and blob hashes, import layout, portable paths and size limits. It rejects symlinks/submodules and never executes builds or third-party code. Limits: 2,000 files, 200 MiB uncompressed, 20 MiB ZIP. Artifact cache identity includes repo ID, kind, path, commit and packager version. Artifacts are immutable and private; no public object URL bypasses policy.

`downloadRequests` counts artifact-ready ticket issuance, once per idempotency key. Repeated ticket use, HTTP Range and HEAD do not increment it. Counts are not unique visitors, completed downloads or installations. Stars belong to the whole repository. Missing metrics are null. Lists freeze metrics at the catalog snapshot; details show current platform counts.

The install lock and `/v1/check-update` are a protocol for future client integration. Covel owns the trusted lock; package-supplied provenance grants no trust. Offline ZIPs stay local/pinned until explicit source binding verifies content. Unknown host or contract context produces `unknown`. Local edits, pending metadata and archival block candidates. The Covel client must calculate file/permission changes and obtain confirmation before staging an update. File rollback does not roll back world saves or data migrations.

## Shared service

One Node 26 process handles both kinds, SQLite snapshots/ledger/policy/counters, the GitHub request queue and private ZIP cache. It serializes GitHub requests under a shared hourly budget; CI can use the authenticated public-only proxy. Visibility is checked on parent repositories before proxying blobs/trees, including cached ones. Private search and arbitrary API paths are rejected. Snapshot transactions are isolated by kind; policy is independent.

| Endpoint | Purpose |
| --- | --- |
| `GET /v1/catalog?kind=plugins` | Search, source/category/locale/status filters, sorting, 24 summaries per page |
| `GET /v1/entries/:encodedKey` | Current metadata, policy state and live request count |
| `GET /v1/entries/:encodedKey/versions` | Latest 200 stored revisions, exact source observations and artifact hashes |
| `POST /v1/downloads` | `{key, revisionId, idempotencyKey}` → private ticket URL and exact artifact |
| `GET` / `HEAD /v1/files/:ticket` | Policy-gated ZIP, including a single HTTP byte range |
| `POST /v1/check-update` | Trusted lock plus host/contract context → explicit update state |
| `GET /v1/policy` | Current independently versioned withdrawal rules |
| `POST /admin/snapshots/:kind` | Kind-scoped complete `{catalog,releases,allowEmpty:false}` ingestion |
| `POST /admin/github/:kind` | Kind-scoped, public-only GitHub read proxy |
| `POST /admin/policy` | Separate policy credential; strictly increasing sequence |

Cursors bind snapshot, metric snapshot, query version and ordering, expire after 30 minutes and reset on policy changes. Errors never become empty search results. Historical snapshots remain available for active cursors. Deployments need disk monitoring and an archival/retention plan; this initial service does not automatically discard ledger history or artifacts.

## Site domains

The plugin site uses `https://plugins.covel.cc/` and links to `https://worlds.covel.cc/`. `site/public/CNAME` and the root-relative asset base support the custom domain. Local previews can override `VITE_SITE_URL` and `VITE_SIBLING_URL`; these are navigation URLs, while `VITE_CATALOG_API` is the shared API origin. A frontend build does not configure DNS or deploy the service.

## Consumer CI and deployment

The production domains are configured in source; DNS, Pages settings and service deployment remain separate actions. The shared service currently uses one Node process, SQLite and a private file cache. Follow [covel-catalog operations](https://github.com/covel-ai/covel-catalog/blob/main/docs/operations.md) for Docker Compose, independent policy publication and backup/recovery. Those operations run from the catalog repository. Workers, Redis and S3 are future deployment options, not dependencies of this consumer.

In this repository, configure the **variable** `CATALOG_API_URL` and **secret** `CATALOG_INGEST_TOKEN` scoped only to plugins. Never put credentials into Vite variables or public files. The policy credential belongs to covel-catalog. Configure Pages to use GitHub Actions and review a complete CI artifact and ingestion receipt before initial publication.

Collection/build has `contents: read`; only the separate Pages job receives `pages: write` and `id-token: write`. Without an API URL, CI produces an explicitly labeled local preview artifact and skips deployment. API failures preserve the current publication; collection checkpoints are saved even when a round exhausts its budget. A configured API with no ingest credential fails rather than falling back to an unrelated GitHub budget.

Rules can target numeric repository ID, owner ID, package path, commit, content hash or archive hash with a reason and timestamp. Every new download/ticket redemption uses current rules; restoring a listing requires a new policy sequence. Previously transferred files and upstream GitHub direct links cannot be recalled. Static exports preserve observations and do not grant download permission.

## Upgrading the shared implementation

The generated `vendor/catalog-kit` directory is read-only. `catalog-kit.lock.json` records the source repository, full commit, kit version and SHA256 of every file. Use `pnpm kit:sync --commit <full-SHA>` to fetch a reviewed upstream version, then refresh both file dependencies in `pnpm-lock.yaml` and run a clean frozen install. Never hand-edit vendored source or copy an uncommitted upstream directory. `pnpm kit:check` validates the complete source inventory; the installed package is a separate copy so dependency installation cannot modify vendor files. Both the root and site package resolution paths are checked against every source hash in the lock. The installed package's root `node_modules` dependency directory is managed by `pnpm-lock.yaml` and excluded from the source inventory; vendored source has no such exclusion.

Plugins and Worlds share the default dark theme. Only a saved `covel-theme=light` selects light; unavailable storage falls back to dark without breaking the page. Initialization does not save a preference. Each site's HTML includes the exact synchronous output of `node vendor/catalog-kit/tools/theme-bootstrap.mjs` before external assets, with `html.dark` as its fallback. After a kit update, refresh that marked head block; `pnpm check` verifies it against the pinned generator. Browser preferences are stored separately on the two hostnames.

The consumer's collection, manifest-layout and browser tests run against the pinned kit. Keep the plugin and world consumers on the same reviewed release. Template changes require regenerating the workflow with `node scripts/catalog/workflow.mjs --write` and reviewing its permissions and deployment gates.

## Validation

`pnpm test:catalog` covers discovery contracts, resumption, adapters, policy changes, signed cursors, release conflicts, deterministic packaging, private-proxy rejection, idempotency, HTTP ranges and source-lock integrity. Backup/restore tests run in covel-catalog. `pnpm test:site` exercises responsive layouts, bilingual search, theme, 10,000-entry paging, errors and browser history against production assets. `pnpm test` retains the official plugin regressions. Real GitHub smoke is explicit (`node scripts/catalog/smoke.mjs` or its manual workflow), separate from offline PR validation.
