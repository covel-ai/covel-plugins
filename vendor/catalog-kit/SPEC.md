# Covel catalog protocol, version 1

This is the shared implementation contract for `covel-plugins` and `covel-worlds`.
The authoritative source is `covel-ai/covel-catalog/packages/catalog-kit`. Both sites
consume an exact commit with a versioned file manifest and SHA256 checks. A
consumer must not independently edit its copy. Both consumers run the same
contract tests. Product-specific parsing belongs in adapters, not a second UI,
collector transport, policy engine, or download service.

## Ownership and rollout

- Worlds owns shared GitHub transport/discovery, durable collection rounds, tag
  discovery, ZIP core, their tests, this specification, the worlds adapter, and
  consumer synchronization checks.
- Plugins owns shared types/UI, registry service, plugins adapter and
  service deployment files. Changes affecting the other adapter are communicated
  before integration; the other maintainer reviews the resulting diff.
- Each repository retains its package manager. Runtime: Node 26. Pages deployment
  and the shared service deployment are separate. Do not create infrastructure or
  publish credentials as part of building an artifact.
- Current Covel installation semantics remain authoritative. A registry response
  is not a local installation: main-application integration is a separate scope.

## Discovery and provenance

Topics are alternatives: `covel-plugin` / `covel-plugins` and `covel-world` /
`covel-worlds`. Search each and merge by numeric GitHub repository ID, then verify
current public visibility and topics. Include forks explicitly; show fork status.
Reconcile the entire topic membership on scheduled runs, including removals.
Use creation-time partitions when GitHub's 1,000-result search limit is exceeded;
never silently truncate. Use supported API sort fields and verify page counts.

Seed repositories preserve old listings and official examples; seeds are explicit
exceptions and must still be public and unblocked. An official designation comes
only from the current canonical repository-name allowlist, never package content
or a prior owner. Old registry JSON can supply migration metadata, but cannot
override current package versions, licenses or compatibility declarations.

Request GitHub sequentially through a queue, honor retry/reset headers, and use
ETags with matching cached response bodies. A `304` without a usable body requires
a fresh unconditional request. Follow only validated bounded same-origin API
redirects; do not forward credentials across origins. Use immutable commit/blob
caches. Persist resumable collection checkpoints; a six-hour schedule is a trigger,
not a promise that an initial crawl of 10,000 repositories fits one token budget.

API, authentication, rate-limit, network, incomplete-search and truncated-tree
errors fail the run and do not replace the last complete snapshot. A known 404 or
private repository exits the directory. A malformed individual manifest becomes a
pending package with diagnostics, even when a sibling package is valid. A repository
without a manifest becomes a repository candidate (`path: null`). Unexpected empty
results must pass completeness checks. Never execute repository scripts.

## Public data and identities

Envelope: `schemaVersion`, `kind`, `generatedAt`, `mode`, `topics`, `stats`,
`entries`, `issues`. Kinds are `plugins` and `worlds`; modes are `github` and `local`.
`/catalog.json` is a public snapshot/export, not a mandatory browser payload.

`packageKey`/`entry.key` is an opaque stable encoding of numeric repository ID,
kind and exact package path. Local fixtures use an explicit local prefix.
Repository names can change without changing identity; package-directory changes
create a different identity and cannot silently take over an existing installation.
Repository candidates do not count as distributable packages.

An entry contains identity, repository ID/current name/URL, owner ID, path, display
name/description/translations, version, source reference, commit, author, license,
category/tags/locales, official/discovery/fork, metadata status/problems, repository
Stars, source links and timestamps. Adapter fields include host range and world
plugin preset. Unknown values are null, not fabricated zeros or compatibility.
`indexed` means minimum catalog metadata is valid; it is not review, compatibility,
permission approval or successful installation. Moderation and artifact availability
are separate dimensions. Archived entries are filterable and hidden by default.

## Immutable revisions and artifacts

Keep these separate in durable storage:

1. Source observation: package identity, reference type (`branch`, `tag`, `commit`)
   and name, resolved full commit SHA, discovery and fetch timestamps. Annotated
   tags are peeled to commits. A repository tag is not automatically a new release
   of every package in that repository.
2. Package revision: declared version, normalized package file-set content hash and
   hash algorithm version, host range (nullable), declarations and release evidence.
   Plugins require matching versions in `package.json` and `PLUGIN.md`. Worlds
   without a host declaration retain unknown compatibility.
3. Artifact: revision ID, packager version, ZIP SHA256, byte size and storage key.
   Repacking may add another artifact but cannot overwrite the old artifact or be
   presented as a new source-package version.

Release evidence has an explicit tag-name binding. For a repository containing
exactly one package at its root, `<version>` or `v<version>` matches that package's
manifest version. A nested package requires `<id>/v<version>` or
`<package-path>/v<version>`. A generic monorepo tag cannot promote unrelated packages
to stable releases, even if their development manifests contain valid SemVer.
Unmatched refs remain source observations/diagnostics, not release candidates.
Prerelease tags are recorded but never selected for the stable channel.

`collectReleases` accepts `now: Date` and persists repository tag-page progress,
each annotated-tag dereference and commit extraction. The adapter parses once per
repository/commit and never chooses metadata based on the supplied diagnostic tag.
`artifacts/releases.json` is a sidecar array, published with the current catalog;
both queues are acknowledged only after successful output. Network and truncated
tree failures abort publication; invalid package metadata yields diagnostics.
GitHub tag pagination has no transactional history boundary or total count.
Duplicate pages are rejected/restarted; tags inserted or removed during pagination
can require the next round. A successful sidecar is a set of observed releases,
not proof of exhaustive historical versions. Current Topics membership completeness
is validated separately. The durable service retains earlier release observations.

Hash normalization fixes path ordering and encoding; it must not rewrite source
bytes or line endings. Record the algorithm; verify compatibility with the Covel
installer digest before comparing values produced by different implementations.
ZIP output is deterministic for the same file set and packager version.

The ledger is append-only. Never use a CI cache as its only storage. Same official
version with different content, or a moved published tag, records a conflict and
preserves the original mapping. Branch development snapshots may share a declared
version but have distinct revisions. A new repository commit with unchanged package
content records an observation, not a package update. Other monorepo packages do
not affect this package's update status.

Use SemVer precedence, including prerelease rules and ignoring build metadata for
precedence. Invalid version text remains visible but cannot select a stable update.
Stable candidates require release evidence, known matching host/contract context,
an allowed policy state, and a distributable artifact. Stable tracking is a future
explicit channel, not a change to existing pinned installations.

Keep `releasePublishedAt` (nullable), `firstSeenAt`, `contentChangedAt` and `fetchedAt`
distinct. A repository push, unrelated release or re-fetch cannot refresh a package's
publication date. When no release date is known, label the actual first-seen or
content-change timestamp used by the list.

## Installation and update boundary

The Covel installer owns the trusted installation lock: package key, installed
version/commit/content hash/artifact hash, registry and ref, update policy,
installed/last-checked timestamps and previous revision. Package-supplied files
cannot grant official/reviewed identity. An unverifiable offline ZIP stays
local/pinned; explicitly binding it to a registry requires matching real content.

Branch installations follow that branch but pin every proposed update to a commit.
Tag/commit installations remain pinned. A check produces a concrete candidate and
version/source/file/permission differences. Local modifications, policy revocation,
invalid metadata and incompatibility prevent replacement. The user confirms changes;
updates are staged for backend restart under the existing Covel contract. Failed
file promotion preserves the previous package. World-data preflight/sync and save
migrations require their own review: file rollback does not reverse gameplay or
data changes. No directory UI may claim that client integration already exists.

## Shared policy and moderation

One versioned rule engine supports repository ID, repository+package path, owner ID
where needed, exact commit, and artifact hash, with reason and effective timestamp.
Rules override topics, official status and seeds. Support revocation and restoration;
first-version reports can use GitHub Issues without adding accounts or an automated
security-certification claim.

Publish policy independently of collection, so GitHub failure cannot prevent
revocation. Collection, list/detail responses and the download gateway enforce it.
Cached artifacts and old tickets are checked against current rules on every new
download request. Keep artifact storage private; a permanent public object URL
would bypass revocation. Already-transferred bytes and upstream GitHub links are
outside this enforcement boundary. Covel-native GitHub installation/update needs
explicit client integration before it can enforce registry policy.

## Downloads and metrics

Two Pages sites use one service and protocol: choose a validated package/revision,
resolve repository ID/path/commit from trusted registry state, check current policy,
prepare or reuse a deterministic Covel-importable ZIP, issue a request ticket and
download. Adapters define the ZIP root and required files. A repository-wide ZIP
is never substituted for a selected subpackage. Required build outputs must already
exist: the gateway does not build or install third-party code.

Cache identity includes repo ID, kind, package path, commit and packager version.
Use single-flight preparation and bounded resource limits. Downloaded files remain
behind the policy gate even on a cache hit. Detail text/README, version information
and the archive must refer to the same immutable revision.

`downloadRequests` counts validated, artifact-ready, successfully issued requests
in durable transactional storage. An idempotency key prevents retry double-counting;
ticket reuse and HTTP Range requests do not increment it. This is not completed
downloads, installations or distinct people. Repository Stars are a GitHub repo
metric shared by its packages. GitHub Release asset counts, if shown, are separate
upstream metrics and must never be added to platform counts. Metrics include source,
definition and measurement time; missing is null. Installation-success reporting
requires a separate client receipt/telemetry design.

## Query API and UI

The shared service provides search, filters, ordering and cursor pagination, initially
24 summaries per page. Fetch details/README/history on demand. Search is debounced
250 ms; cancel stale requests. Put filters and ordering in the URL and restore scroll
position on back navigation. Render one page; add virtualization only for a measured
long-list need. Errors are not empty results.

Cursors bind the data snapshot, metrics snapshot, query/order version and stable
tie-break key, with expiry. Stats refresh cannot reshuffle an existing page sequence.
Current policy is always applied; policy changes may invalidate a cursor explicitly
instead of preserving a revoked entry in an old snapshot.

Search defaults to relevance (exact name/ID before description/tags). Browsing
defaults to real package release/content time. Expose repository Stars, cumulative
platform request count, package update time and name sorting. Unknown metrics sort
last. Source tabs filter official/community; featured selections, if added, are a
separate area rather than an undisclosed ranking boost.

One configurable shadcn UI uses IBM Plex Sans, green-grey framed-sheet styling,
source tabs, search/filter/sort, bilingual labels, themes and download/version
details. Compact desktop lists reserve width for name/description; full hashes and
history live in detail. Mobile uses a filter Sheet and single-column rows with
44px targets. Optional world-cover cards use the same component configuration.

## Persistence, CI and acceptance

Use one service for directory queries, revision ledger, policy, gateway and metrics.
The portable initial deployment is a Node 26 service with persistent storage and
private artifact cache; hosting target remains an explicit deployment decision.
Publish complete snapshots transactionally by kind: a worlds failure cannot roll
back plugins or policy. Back up and test recovery of ledger, policy and counters.

Collection schedule: `17 */6 * * *`, plus main push and manual dispatch. Separate
read-only GitHub collection/build from deployment and authenticated snapshot
ingestion. Browser code has no GitHub credential. PR fixture tests are offline;
controlled online API smoke tests are explicit. Persist useful resumable caches
without treating partial runs as successful catalogs.

Required regressions: topic union/dedup/removal, 1,000-result partitions and timestamp
boundaries, real URL contracts, rate-limit backoff, 304 without cache, bounded 301
rename/transfer, private/deleted repositories, malformed/oversized manifests,
truncated trees, sibling valid+invalid packages, duplicate IDs across repositories,
tag movement, same-version conflict, branch snapshots, prereleases/build metadata,
unchanged packages under changed repo commits, package moves, hash-algorithm mismatch,
artifact rebuild, offline source binding, revoked old links/tickets, version-only
revocation, restore, cursor policy invalidation, idempotency/Range, persistence recovery,
and installer/world-data boundary verification.

Use synthetic 100/1,000/10,000-entry datasets only in tests. Measure payload, DOM,
latency and memory; first-page network/rendering must scale with the 24-item page,
not total catalog size. Test mobile interactions and stable query/pagination. Verify
complete local/CI artifacts and peer findings before real deployment.

## Asynchronous deployment extension (kit 0.3)

`POST /v1/downloads` may return HTTP 202 with `{state:"pending",jobId,retryAfter}`.
This has no ticket and does not change counters. Repeat the same request with the
same idempotency key; 200 retains the existing ticket contract. Clients cancel
polling when leaving the detail view. The shared UI supports both Node's immediate
response and asynchronous Workers preparation. Failed tasks return an explicit
error; no repository ZIP or unverified URL is substituted.

Storage adapters import `core` for policy matching, revision identities, release
validation, timestamp projection, query options and update selection. Node remains
synchronous. A D1 adapter must use transactional batches/conditional writes, not
unprotected asynchronous translations of Node transactions. Heavy collection and
packaging may execute the fixed shared package in a trusted job runner; package
contents are only parsed as data. `collector` unifies production collection and
revalidates resumed repository identities before acknowledging publication.

A service can advertise `X-Catalog-Ingest: staged-v1` on the policy preflight.
The shared publisher then sends a manifest, ordered bounded entry/release/issue
records, and a completion request to the same kind-scoped ingestion prefix.
The manifest includes an ordered rolling SHA-256 chain and complete counts.
A deterministic publication identity and persisted next record allow retry; only a
validated finish switches the live snapshot. Services without this header retain
the original direct snapshot payload. No publishing credential is exposed to UI.
