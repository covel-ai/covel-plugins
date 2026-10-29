# Catalog architecture and operations

**English** · [简体中文](catalog.zh-CN.md)

Plugins and Worlds use one implementation in [`packages/catalog-kit`](../packages/catalog-kit/SPEC.md). Worlds vendors an exact commit with a full SHA256 manifest; its CI rejects modified or extra vendor files. Change the canonical source, review across both repositories, then update the pinned consumer. The shared Pages workflow template is checked against each instantiated workflow.

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

## Deployment boundary

No host or cloud resource is provisioned by this repository. Choose a host with a persistent private volume, HTTPS reverse proxy, backups and enough memory for bounded archive work. The container defaults to a 2 GiB limit in Compose. TLS termination and public host selection remain deployment tasks.

1. Copy `service/.env.example` to `service/.env`; supply a public HTTPS origin, exact allowed browser origins, a GitHub credential with public read access, and three distinct secrets of at least 32 characters from your secret manager. Plugins, Worlds and policy use different secrets. Never put credentials into Vite variables or public files.
2. Build and start on the chosen host: `docker compose -f service/compose.yaml up --build -d`. The service binds to host loopback; configure the HTTPS proxy separately. For local inspection, `pnpm serve:catalog` binds to `127.0.0.1:8787`. A fresh instance deliberately returns 503 for catalog/downloads until current policy and complete snapshots exist.
3. Review `catalog/policy.json`, update its issued/expiry times and monotonic sequence, and publish it with the independent manual policy workflow or `node scripts/catalog/publish-policy.mjs`. The checked-in initial policy is a review draft, not an evergreen production policy. Publish renewal before expiry; unavailable/expired policy disables platform queries/downloads.
4. In each repository configure the **variable** `CATALOG_API_URL` and **secret** `CATALOG_INGEST_TOKEN` scoped to its kind. Only the canonical policy repository gets `CATALOG_POLICY_TOKEN`. Configure Pages to use GitHub Actions. Set deployment environment protection as needed for the actual organization.
5. Review a complete CI artifact and ingestion receipt before initial publication. The workflow's collection/build job has `contents: read`; only the separate Pages job has `pages: write` and `id-token: write`. Without an API URL, CI produces an explicitly labeled local preview artifact and skips deployment.

The service has an in-memory limit of 180 requests/minute per socket address and four concurrent download handlers. The supplied reverse-proxy setup does not trust forwarded IP headers; clients behind one proxy share this limit. Measure traffic and set an appropriate deployment limit before public rollout. Queue budget exhaustion preserves collection progress. Two CI jobs do not need separate GitHub tokens when using the shared proxy.

Rules can target numeric repository ID, owner ID, package path, commit, content hash or archive hash with a reason and timestamp. Every new download/ticket redemption uses current rules; restoring a listing requires a new policy sequence. Previously transferred files and upstream GitHub direct links cannot be recalled. Static exports may preserve old observations and do not confer permission to download.

## Backup and recovery

Use SQLite's online backup API, not a copy of only the live database file while WAL writes are active:

```sh
node service/backup.mjs create service/data service/backups/2026-10-29
node service/backup.mjs verify service/backups/2026-10-29
```

The destination must be new. The backup includes the database and every referenced artifact with checksums. Move encrypted copies off-host and monitor successful verification. To restore, stop the service, verify the backup, copy its `catalog.sqlite` and `artifacts/` into an empty private data volume owned by the container's `node` user, then restart. Check policy expiry/sequence before reopening downloads; rotate credentials if recovery follows a compromise. HTTP cache is disposable, while ledger, policy, counters and immutable artifacts are not.

## Validation

`pnpm test:catalog` covers discovery contracts, resumption, adapters, policy changes, signed cursors, release conflicts, deterministic packaging, private-proxy rejection, idempotency, HTTP ranges and backup restore. `pnpm test:site` exercises responsive layouts, bilingual search, theme, 10,000-entry paging, errors and browser history against production assets. `pnpm test` retains the official plugin regressions. Real GitHub smoke is explicit (`node scripts/catalog/smoke.mjs` or its manual workflow), separate from offline PR validation.
