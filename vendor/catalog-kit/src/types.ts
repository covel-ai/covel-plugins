export type CatalogKind = "plugins" | "worlds";
export type CatalogLocale = "en-US" | "zh-CN";
export type SourceRef = { type: "branch" | "tag" | "commit"; name: string };
export type CatalogIssue = { repository: string; path: string | null; message: string };

/** Stable identity: github:<numeric repository ID>:<kind>:package:<encoded path>.
 * A repository candidate ends in :repository. Local previews start with local:.
 * Metadata completeness, official maintenance, archival and policy are separate.
 */
export interface CatalogEntry {
  key: string;
  kind: CatalogKind;
  id: string;
  name: string;
  description: string;
  repositoryId: number | null;
  ownerId: number | null;
  repository: string;
  repositoryUrl: string;
  author: string;
  path: string | null;
  sourceRef: SourceRef | null;
  commitSha: string | null;
  /** SHA-256 of relative paths, Git blob IDs and modes; available without fetching file bytes. */
  sourceTreeHash: string | null;
  /** Set only after reading package bytes. Never substitute a Git tree hash here. */
  contentHash: string | null;
  hashScheme: "covel-package-v1" | null;
  version: string | null;
  covelVersion: string | null;
  pluginPreset?: string | null;
  license: string | null;
  category: string;
  tags: string[];
  locales: string[];
  translations: Record<string, { name?: string; description?: string; notes?: string }>;
  official: boolean;
  discovery: "topic" | "seed" | "local";
  fork: boolean;
  status: "indexed" | "pending" | "archived";
  problems: string[];
  stars: number | null;
  downloadRequests: number | null;
  releasePublishedAt: string | null;
  firstSeenAt: string | null;
  contentChangedAt: string | null;
  fetchedAt: string | null;
  installUrl: string | null;
  pinnedUrl: string | null;
  readmeUrl: string;
  /** Filled by the service, not by an upstream manifest. */
  revisionId?: string | null;
  blocked?: boolean;
  policyReason?: string | null;
  legacyMetadata?: { covelVersion: string | null; notes: string };
}

export interface Catalog {
  schemaVersion: 1;
  kind: CatalogKind;
  generatedAt: string | null;
  mode: "github" | "local";
  topics: string[];
  stats: { repositories: number; entries: number; packages: number; indexed: number; pending: number; archived: number; issues: number };
  entries: CatalogEntry[];
  issues: CatalogIssue[];
}

export interface CatalogPage {
  schemaVersion: 1;
  kind: CatalogKind;
  snapshotId: string;
  metricsSnapshot: string;
  generatedAt: string | null;
  mode: "github" | "local";
  topics: string[];
  items: CatalogEntry[];
  total: number;
  nextCursor: string | null;
  policyVersion: string;
  facets: { categories: string[]; locales: string[] };
}

export interface CatalogConfig {
  kind: CatalogKind;
  title: string;
  repository: string;
  siteUrl: string;
  siblingUrl: string;
  /** Omit for static local preview. Production API must use HTTPS. */
  apiBase?: string;
  catalogUrl: string;
  guideUrl: string;
  /** Covel project links, distinct from this directory's source and publishing guide. */
  projectUrl: string;
  demoUrl: string;
  docsUrl: string;
  projectRepository: string;
}

export interface VersionRecord {
  revisionId: string;
  entryKey: string;
  version: string | null;
  commitSha: string;
  sourceRef: SourceRef;
  sourceTreeHash: string;
  contentHash: string | null;
  hashScheme: "covel-package-v1" | null;
  channel: "development" | "release";
  firstSeenAt: string;
  conflict: boolean;
  artifacts: ArtifactRecord[];
  blocked?: boolean;
  observations?: { entryKey: string; sourceRef: SourceRef; commitSha: string; observedAt: string | null; conflict: boolean }[];
  metadata?: Pick<CatalogEntry, "covelVersion" | "license" | "readmeUrl" | "status">;
}

export interface ArtifactRecord {
  artifactSha256: string;
  contentHash: string;
  hashScheme: "covel-package-v1";
  packagerVersion: string;
  size: number;
  filename: string;
}

/** Protocol for future Covel integration. The client owns this trusted record;
 * installing a ZIP containing similar JSON does not establish provenance. */
export interface InstallLock {
  registryUrl: string;
  entryKey: string;
  revisionId: string;
  installedVersion: string | null;
  commitSha: string;
  contentHash: string;
  hashScheme: string;
  artifactSha256: string;
  sourceRef: SourceRef;
  updatePolicy: "pinned" | "branch" | "stable";
  installedAt: string;
  lastCheckedAt: string | null;
  previousRevisionId: string | null;
}
