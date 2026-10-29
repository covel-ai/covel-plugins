import { requestDownload } from "../src/download-client.mjs";
import type { Catalog, CatalogConfig, CatalogEntry, CatalogPage, VersionRecord } from "../src/types";

export type Query = { q: string; source: string; category: string; locale: string; status: string; sort: string };
export const defaultQuery: Query = { q: "", source: "all", category: "all", locale: "all", status: "all", sort: "updated" };
export function queryFromUrl(): Query {
  const params = new URLSearchParams(window.location.search);
  return Object.fromEntries(Object.entries(defaultQuery).map(([key, value]) => [key, params.get(key) ?? value])) as Query;
}
export async function json<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message ?? `Request failed (${response.status})`);
  if (data === null) throw new Error("The directory returned an invalid response");
  return data as T;
}
export function createCatalogClient(config: CatalogConfig) {
  const api = config.apiBase?.replace(/\/$/, "");
  if (api && !/^https:\/\//.test(api) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(api)) throw new Error("Catalog API must use HTTPS");
  let local: Promise<Catalog> | undefined;
  const preview = () => local ??= json<Catalog>(config.catalogUrl).catch((error) => { local = undefined; throw error; });
  return {
    api,
    async list(query: Query, cursor: string | null, signal: AbortSignal): Promise<CatalogPage> {
      if (api) return json(`${api}/v1/catalog?${new URLSearchParams({ ...query, kind: config.kind, limit: "24", ...(cursor ? { cursor } : {}) })}`, { signal });
      const catalog = await preview();
      if (catalog.kind !== config.kind || !Array.isArray(catalog.entries)) throw new Error("Invalid preview catalog");
      const words = query.q.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
      const score = (entry: CatalogEntry) => {
        const names = [entry.name, entry.id, ...Object.values(entry.translations).map((t) => t.name)].join(" ").toLocaleLowerCase();
        return words.reduce((n, w) => n + (names.includes(w) ? 10 : 0), 0);
      };
      const filtered = catalog.entries.filter((e) => (query.source === "all" || e.official === (query.source === "official")) &&
        (query.category === "all" || e.category === query.category) && (query.locale === "all" || e.locales.includes(query.locale)) &&
        (query.status === "all" ? e.status !== "archived" : e.status === query.status) &&
        words.every((w) => JSON.stringify([e.name, e.id, e.description, e.tags, e.repository, e.translations]).toLocaleLowerCase().includes(w)));
      filtered.sort((a, b) => (query.sort === "name" ? a.name.localeCompare(b.name) : query.sort === "stars" ? (b.stars ?? -1) - (a.stars ?? -1) : query.sort === "downloads" ? (b.downloadRequests ?? -1) - (a.downloadRequests ?? -1) : query.sort === "relevance" ? score(b) - score(a) : (b.releasePublishedAt ?? b.contentChangedAt ?? b.firstSeenAt ?? "").localeCompare(a.releasePublishedAt ?? a.contentChangedAt ?? a.firstSeenAt ?? "")) || a.key.localeCompare(b.key));
      const start = Number(cursor ?? 0);
      return { schemaVersion: 1, kind: config.kind, mode: "local", snapshotId: "preview", metricsSnapshot: "preview", generatedAt: catalog.generatedAt,
        topics: catalog.topics, items: filtered.slice(start, start + 24), total: filtered.length, nextCursor: start + 24 < filtered.length ? String(start + 24) : null,
        policyVersion: "preview", facets: { categories: [...new Set(catalog.entries.map((e) => e.category))].sort(), locales: [...new Set(catalog.entries.flatMap((e) => e.locales))].sort() } };
    },
    async detail(key: string, signal: AbortSignal): Promise<CatalogEntry> {
      if (api) return json(`${api}/v1/entries/${encodeURIComponent(key)}`, { signal });
      const entry = (await preview()).entries.find((e) => e.key === key);
      if (!entry) throw new Error("Package no longer listed");
      return entry;
    },
    async versions(key: string, signal: AbortSignal): Promise<VersionRecord[]> {
      return api ? json(`${api}/v1/entries/${encodeURIComponent(key)}/versions`, { signal }) : [];
    },
    async download(key: string, revisionId: string, idempotencyKey: string, signal?: AbortSignal) {
      if (!api) throw new Error("Downloads are unavailable in a local preview");
      return requestDownload({ api, key, revisionId, idempotencyKey, signal });
    },
  };
}
