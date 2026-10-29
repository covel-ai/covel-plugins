import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownToLine, ArrowRight, BookOpen, Check, ChevronLeft, ChevronRight, CircleHelp, Copy, ExternalLink, Globe2, Languages, Menu, Moon, Package, Search, SlidersHorizontal, Sparkles, Star, Sun, X } from "lucide-react";
import type { CatalogConfig, CatalogEntry, CatalogLocale, CatalogPage, VersionRecord } from "../src/types";
import { Button } from "./components/button";
import { Input } from "./components/input";
import { Badge } from "./components/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./components/dialog";
import { Tabs, TabsList, TabsTrigger } from "./components/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/select";
import { Skeleton } from "./components/skeleton";
import { createCatalogClient, defaultQuery, queryFromUrl, type Query } from "./client";
import { applyTheme, readLocale, readTheme, writePreference } from "../src/preferences.mjs";

const labels = {
  "en-US": { plugins: "Plugins", worlds: "Worlds", explore: "Explore", library: "Directory", guide: "Publishing guide", source: "Source on GitHub", add: "List your repository", tagline: "Find the right additions for your next story.", worldTagline: "A setting for every story you want to tell.", search: "Search by name, author or idea…", all: "All sources", official: "Official", community: "Community", categories: "Category", anyCategory: "All categories", language: "Package language", anyLanguage: "Any language", state: "Status", anyState: "Active & pending", indexed: "Indexed", pending: "Pending metadata", archived: "Archived", sort: "Sort by", updated: "Recently updated", relevance: "Relevance", name: "Name, A–Z", stars: "Repository stars", downloads: "Download requests", results: "results", details: "View details", version: "Version", compatibility: "Covel version", unknown: "Not declared", license: "License", download: "Download ZIP", preparing: "Preparing ZIP…", previous: "Previous", next: "Next", retry: "Try again", empty: "No matching packages", emptyText: "Try a different search or clear your filters.", reset: "Clear filters", error: "The directory couldn’t be loaded", filters: "Filters", close: "Close", local: "Local preview", localNote: "Showing local manifests. Live policy, download counts and downloads are unavailable.", indexedNote: "Indexed means metadata is complete. Review the source and permissions before installing.", metricNote: "Stars belong to the repository. Requests count prepared downloads, not installations.", maintain: "Build something for Covel", maintainNote: "Add a topic to your public repository. The directory will find it automatically.", copy: "Copy", copied: "Copied", branch: "Follow branch", pin: "Pinned commit", readme: "Read documentation", history: "Versions & source", noHistory: "Version history appears after the directory service has indexed this package.", development: "Development snapshot", release: "Release", conflict: "Version conflict", firstSeen: "First indexed", changed: "Content updated", published: "Published", unavailable: "This package is not available for download.", downloadNote: "Import this ZIP in Covel and review its permissions. Offline ZIPs stay local/pinned; they do not automatically enable update tracking.", addTitle: "Let the directory find you", addDescription: "In your GitHub repository’s About section, add either topic below. Include a valid package manifest and the files Covel needs to import it.", report: "Report a listing", errorDetail: "Package details are unavailable", back: "Back to results", hash: "Commit", ready: "ZIP ready", getFile: "Save ZIP", noApi: "Connect the shared service to enable downloads and version history.", page: "Page" },
  "zh-CN": { plugins: "插件", worlds: "世界", explore: "发现", library: "资源目录", guide: "发布指南", source: "GitHub 源码", add: "收录你的仓库", tagline: "为下一段故事，找到合适的扩展。", worldTagline: "为想讲述的故事，找到一个世界。", search: "搜索名称、作者或创意…", all: "全部来源", official: "官方", community: "社区", categories: "分类", anyCategory: "全部分类", language: "包语言", anyLanguage: "所有语言", state: "状态", anyState: "活跃和待完善", indexed: "已索引", pending: "待完善元数据", archived: "已归档", sort: "排序", updated: "最近更新", relevance: "相关度", name: "名称 A–Z", stars: "仓库 Star", downloads: "下载请求", results: "条结果", details: "查看详情", version: "版本", compatibility: "Covel 版本", unknown: "未声明", license: "许可证", download: "下载 ZIP", preparing: "正在准备 ZIP…", previous: "上一页", next: "下一页", retry: "重试", empty: "没有匹配的包", emptyText: "换个关键词，或清除筛选条件。", reset: "清除筛选", error: "目录暂时无法加载", filters: "筛选", close: "关闭", local: "本地预览", localNote: "展示本地清单。实时下架规则、下载统计和下载服务尚不可用。", indexedNote: "已索引表示元数据完整；安装前请检查源码和权限。", metricNote: "Star 属于整个仓库；下载请求表示已准备的下载，不是安装次数。", maintain: "为 Covel 创作", maintainNote: "给公开仓库添加 Topic，目录就会自动发现它。", copy: "复制", copied: "已复制", branch: "跟随分支", pin: "固定提交", readme: "阅读文档", history: "版本与来源", noHistory: "目录服务索引后，将在此显示版本记录。", development: "开发快照", release: "发布版本", conflict: "版本冲突", firstSeen: "首次收录", changed: "内容更新", published: "发布时间", unavailable: "此包目前不可下载。", downloadNote: "在 Covel 中导入 ZIP，并检查所需权限。离线 ZIP 保持本地／固定版本，不会自动建立更新追踪。", addTitle: "让目录发现你的作品", addDescription: "在 GitHub 仓库的 About 区域添加以下任一 Topic，并提供有效清单和 Covel 导入所需文件。", report: "反馈条目", errorDetail: "暂时无法加载包详情", back: "返回结果", hash: "提交", ready: "ZIP 已准备好", getFile: "保存 ZIP", noApi: "连接共享服务后可使用统一下载和版本历史。", page: "页" },
};
type Labels = typeof labels["en-US"];
type Client = ReturnType<typeof createCatalogClient>;
const count = (n: number | null) => n === null ? "—" : new Intl.NumberFormat("en", { notation: n >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(n);
const display = (entry: CatalogEntry, locale: CatalogLocale) => ({ name: entry.translations[locale]?.name ?? entry.name, description: entry.translations[locale]?.description ?? entry.description });

function Pick({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: [string, string][] }) {
  return <div className="filter-field"><span>{label}</span><Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label}><SelectValue /></SelectTrigger><SelectContent>{options.map(([v, title]) => <SelectItem key={v} value={v}>{title}</SelectItem>)}</SelectContent></Select></div>;
}
function CopyButton({ value, t }: { value: string; t: Labels }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  return <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => setError(true)); }} title={error ? value : undefined}>{copied ? <Check /> : <Copy />}{copied ? t.copied : t.copy}</Button>;
}
function PackageDialog({ entryKey, close, client, locale, t }: { entryKey: string | null; close: () => void; client: Client; locale: CatalogLocale; t: Labels }) {
  const [entry, setEntry] = useState<CatalogEntry>();
  const [versions, setVersions] = useState<VersionRecord[]>([]);
  const [revision, setRevision] = useState("");
  const [error, setError] = useState("");
  const downloadAbort = useRef<AbortController | null>(null);
  useEffect(() => () => { generation.current++; downloadAbort.current?.abort(); }, [entryKey, revision]);
  const [busy, setBusy] = useState(false);
  const [ticket, setTicket] = useState<{ url: string; artifact: { artifactSha256: string; filename: string } }>();
  const requestKey = useRef("");
  const generation = useRef(0);
  useEffect(() => {
    if (!entryKey) return;
    const controller = new AbortController(); generation.current++;
    setEntry(undefined); setVersions([]); setError(""); setBusy(false); setTicket(undefined); requestKey.current = crypto.randomUUID();
    Promise.all([client.detail(entryKey, controller.signal), client.versions(entryKey, controller.signal)]).then(([detail, history]) => {
      if (controller.signal.aborted) return;
      setEntry(detail); setVersions(history); setRevision(detail.revisionId ?? "");
    }).catch((e) => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [entryKey, client]);
  const text = entry ? display(entry, locale) : undefined;
  const selected = versions.find((v) => v.revisionId === revision);
  const sha = selected?.commitSha ?? entry?.commitSha;
  const pinnedUrl = sha && entry ? `${entry.repositoryUrl}/tree/${sha}${entry.path ? `/${entry.path.split("/").map(encodeURIComponent).join("/")}` : ""}` : null;
  return <Dialog open={Boolean(entryKey)} onOpenChange={(open) => { if (!open) close(); }}><DialogContent className="package-dialog">
    <DialogHeader><div className="eyebrow">{entry?.repository ?? "Covel"}</div><DialogTitle>{text?.name ?? t.details}</DialogTitle><DialogDescription>{text?.description ?? t.history}</DialogDescription></DialogHeader>
    {error && <div className="error-box" role="alert"><strong>{t.errorDetail}</strong><p>{error}</p></div>}
    {!entry && !error && <div aria-label="Loading"><Skeleton className="h-24 w-full" /></div>}
    {entry && <>
      <div className="detail-badges"><Badge variant="secondary">{entry.official ? t.official : t.community}</Badge><Badge variant="outline">{t[entry.status]}</Badge>{entry.fork && <Badge variant="outline">Fork</Badge>}</div>
      <dl className="detail-facts"><div><dt>{t.version}</dt><dd>{selected?.version ?? entry.version ?? "—"}</dd></div><div><dt>{t.compatibility}</dt><dd>{(selected ? selected.metadata?.covelVersion : entry.covelVersion) ?? t.unknown}</dd></div><div><dt>{t.license}</dt><dd>{(selected ? selected.metadata?.license : entry.license) ?? t.unknown}</dd></div><div><dt>{t.stars}</dt><dd>{count(entry.stars)}</dd></div><div><dt>{t.downloads}</dt><dd>{count(entry.downloadRequests)}</dd></div></dl>
      <section className="detail-section"><h3>{t.history}</h3>{versions.length ? <Pick label={t.version} value={revision} onChange={(value) => { generation.current++; downloadAbort.current?.abort(); setBusy(false); setError(""); setRevision(value); setTicket(undefined); requestKey.current = crypto.randomUUID(); }} options={versions.map((v) => [v.revisionId, `${v.version ?? "—"} · ${v.channel === "development" ? t.development : t.release} · ${v.commitSha.slice(0, 7)}${v.conflict ? ` · ${t.conflict}` : ""}`])} /> : <p className="muted">{t.noHistory}</p>}
        {sha && <div className="hash-line"><span>{t.hash}</span><code>{sha}</code><CopyButton value={sha} t={t} /></div>}
        {entry.installUrl && <div className="source-line"><span>{t.branch}</span><a href={entry.installUrl} target="_blank" rel="noreferrer">{entry.sourceRef?.name}<ExternalLink size={13} /></a><CopyButton value={entry.installUrl} t={t} /></div>}
        {pinnedUrl && <div className="source-line"><span>{t.pin}</span><a href={pinnedUrl} target="_blank" rel="noreferrer">{sha?.slice(0, 12)}<ExternalLink size={13} /></a><CopyButton value={pinnedUrl} t={t} /></div>}
      </section>
      {selected?.observations?.some((o) => o.conflict) && <p className="diagnostics" role="status">{t.conflict}: {selected.observations.filter((o) => o.conflict).map((o) => `${o.sourceRef.name} → ${o.commitSha.slice(0, 12)}`).join(" · ")}</p>}
      {entry.problems.length > 0 && <p className="diagnostics">{entry.problems.join(" · ")}</p>}
      <p className="muted small">{t.indexedNote}</p>
      <div className="download-panel"><p>{!client.api ? t.noApi : entry.status !== "indexed" ? t.unavailable : t.downloadNote}</p><Button disabled={!client.api || entry.status === "archived" || selected?.metadata?.status !== "indexed" || !revision || selected?.conflict || selected?.blocked || busy} onClick={async () => {
        setBusy(true); setError(""); const started = generation.current;
        try { downloadAbort.current?.abort(); downloadAbort.current = new AbortController(); const result = await client.download(entry.key, revision, requestKey.current, downloadAbort.current.signal); if (started === generation.current) setTicket(result); }
        catch (e) { if (started === generation.current) setError((e as Error).message); } finally { if (started === generation.current) setBusy(false); }
      }}><ArrowDownToLine />{busy ? t.preparing : t.download}</Button>
      {ticket && <div className="ticket"><a href={ticket.url} className="download-link">{t.getFile}<ArrowRight size={16} /></a><span>SHA-256</span><code>{ticket.artifact.artifactSha256}</code></div>}</div>
      <div className="dialog-links"><a href={selected?.metadata?.readmeUrl ?? entry.readmeUrl} target="_blank" rel="noreferrer"><BookOpen size={15}/>{t.readme}<ExternalLink size={12}/></a><a href={entry.repositoryUrl} target="_blank" rel="noreferrer">GitHub<ExternalLink size={12}/></a></div>
    </>}
  </DialogContent></Dialog>;
}

export function CatalogApp({ config }: { config: CatalogConfig }) {
  const client = useMemo(() => createCatalogClient(config), [config]);
  const [locale, setLocale] = useState<CatalogLocale>(readLocale);
  const [dark, setDark] = useState(() => readTheme() === "dark");
  const [query, setQuery] = useState<Query>(queryFromUrl);
  const [search, setSearch] = useState(query.q);
  const [cursor, setCursor] = useState<string | null>(() => window.history.state?.covel?.cursor ?? null);
  const [history, setHistory] = useState<(string | null)[]>(() => window.history.state?.covel?.history ?? []);
  const [page, setPage] = useState<CatalogPage>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [filters, setFilters] = useState(false);
  const [add, setAdd] = useState(false);
  const [selected, setSelected] = useState<string | null>(() => new URLSearchParams(location.search).get("package"));
  const restoreScroll = useRef<number | null>(window.history.state?.covel?.scroll ?? null);
  const queryPending = useRef(true);
  const t = labels[locale];
  useEffect(() => { applyTheme(dark ? "dark" : "light"); }, [dark]);
  useEffect(() => { document.documentElement.lang = locale; document.title = `${t[config.kind]} · Covel`; }, [locale, config.kind, t]);
  function toggleTheme() {
    const next = !dark;
    setDark(next);
    writePreference("covel-theme", next ? "dark" : "light");
  }
  function toggleLocale() {
    const next = locale === "en-US" ? "zh-CN" : "en-US";
    setLocale(next);
    writePreference("covel-locale", next);
  }
  function navigate(next: { query: Query; cursor: string | null; history: (string | null)[]; selected: string | null; scroll: number; detailFromList?: boolean }, mode: "push" | "replace" = "push") {
    window.history.replaceState({ ...window.history.state, covel: { query, cursor, history, selected, ...window.history.state?.covel, scroll: window.scrollY } }, "");
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(next.query)) if (value !== defaultQuery[key as keyof Query]) params.set(key, value);
    if (next.selected) params.set("package", next.selected);
    window.history[mode === "push" ? "pushState" : "replaceState"]({ covel: next }, "", `${location.pathname}${params.size ? `?${params}` : ""}`);
    setQuery(next.query); setSearch(next.query.q); setCursor(next.cursor); setHistory(next.history); setSelected(next.selected); restoreScroll.current = next.scroll;
  }
  function update(patch: Partial<Query>, mode: "push" | "replace" = "push") { navigate({ query: { ...query, ...patch }, cursor: null, history: [], selected: null, scroll: window.scrollY }, mode); }
  function openDetails(key: string) { navigate({ query, cursor, history, selected: key, scroll: window.scrollY, detailFromList: true }); }
  function closeDetails() {
    if (window.history.state?.covel?.detailFromList) window.history.back();
    else navigate({ query, cursor, history, selected: null, scroll: window.scrollY }, "replace");
  }
  function turnPage(nextCursor: string | null, prior: (string | null)[]) { navigate({ query, cursor: nextCursor, history: prior, selected: null, scroll: document.getElementById("results")?.offsetTop ?? 0 }); }
  useEffect(() => { const timer = setTimeout(() => { if (search !== query.q) update({ q: search, sort: search.trim() ? "relevance" : "updated" }, "replace"); }, 250); return () => clearTimeout(timer); }, [search, query.q]);
  useEffect(() => {
    const previous = window.history.scrollRestoration; window.history.scrollRestoration = "manual";
    if (!window.history.state?.covel) window.history.replaceState({ covel: { query, cursor, history, selected, scroll: window.scrollY } }, "");
    const onBack = () => {
      const state = window.history.state?.covel, next = state?.query ?? queryFromUrl();
      setQuery(next); setSearch(next.q); setCursor(state?.cursor ?? null); setHistory(state?.history ?? []); setSelected(state?.selected ?? new URLSearchParams(location.search).get("package")); restoreScroll.current = state?.scroll ?? 0;
    };
    window.addEventListener("popstate", onBack); return () => { window.removeEventListener("popstate", onBack); window.history.scrollRestoration = previous; };
  }, []);
  useEffect(() => {
    const controller = new AbortController(); queryPending.current = true; setLoading(true); setError("");
    client.list(query, cursor, controller.signal).then((result) => { if (!controller.signal.aborted) setPage(result); }).catch((e) => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) { queryPending.current = false; setLoading(false); } });
    return () => controller.abort();
  }, [client, query, cursor, retry]);
  useEffect(() => {
    if (loading || queryPending.current || restoreScroll.current === null || selected) return;
    const y = restoreScroll.current; restoreScroll.current = null;
    requestAnimationFrame(() => window.scrollTo(0, y));
  }, [loading, page, selected]);
  useEffect(() => {
    if (!client.api) return;
    const timer = setInterval(() => setRetry((n) => n + 1), 60_000);
    return () => clearInterval(timer);
  }, [client]);
  function reset() { setSearch(""); update(defaultQuery); }
  const hasMetrics = page?.items.some((entry) => entry.stars !== null || entry.downloadRequests !== null);
  const filterContent = <>
    <Pick label={t.categories} value={query.category} onChange={(category) => update({ category })} options={[["all", t.anyCategory], ...(page?.facets.categories ?? []).map((c): [string, string] => [c, c.replaceAll("-", " ")])]} />
    <Pick label={t.language} value={query.locale} onChange={(lang) => update({ locale: lang })} options={[["all", t.anyLanguage], ...(page?.facets.locales ?? []).map((l): [string, string] => [l, l])]} />
    <Pick label={t.state} value={query.status} onChange={(status) => update({ status })} options={[["all", t.anyState], ["indexed", t.indexed], ["pending", t.pending], ["archived", t.archived]]} />
    <Button variant="ghost" className="reset-filter" onClick={reset}><X size={14}/>{t.reset}</Button>
  </>;
  return <div className="catalog-frame">
    <a className="skip-link" href="#results">Skip to results</a>
    <header className="frame-header"><a href={config.siteUrl} className="brand"><span className="brand-mark">c</span><span>covel</span><span className="brand-divider"/><span className="brand-caption">{t.explore}</span></a><div className="header-actions"><Button variant="ghost" size="icon" onClick={toggleLocale} aria-label={locale === "en-US" ? "切换为中文" : "Switch to English"}><Languages/></Button><Button variant="ghost" size="icon" onClick={toggleTheme} aria-label={dark ? "Light theme" : "Dark theme"}>{dark ? <Sun/> : <Moon/>}</Button><Button variant="ghost" size="icon" className="mobile-menu" onClick={() => setFilters(true)} aria-label={t.filters}><Menu/></Button></div></header>
    <aside className="sidebar"><div className="eyebrow">{t.library}</div><nav aria-label="Directories"><a className={config.kind === "plugins" ? "active" : ""} href={config.kind === "plugins" ? config.siteUrl : config.siblingUrl}><Package size={18}/>{t.plugins}{config.kind === "plugins" && <span className="nav-dot"/>}</a><a className={config.kind === "worlds" ? "active" : ""} href={config.kind === "worlds" ? config.siteUrl : config.siblingUrl}><Globe2 size={18}/>{t.worlds}{config.kind === "worlds" && <span className="nav-dot"/>}</a></nav><div className="sidebar-filters">{filterContent}</div><div className="sidebar-bottom"><a href={config.guideUrl}><BookOpen size={16}/>{t.guide}<ExternalLink size={12}/></a><a href={config.repository}><ExternalLink size={16}/>{t.source}</a><p>Made for stories.<br/>Built with the community.</p></div></aside>
    <main className="content-sheet"><div className="page-heading"><div><h1>{t[config.kind]}<span className="title-dot">.</span></h1><p>{config.kind === "worlds" ? t.worldTagline : t.tagline}</p></div><Button variant="outline" onClick={() => setAdd(true)}><span className="plus">+</span>{t.add}</Button></div>
      <div className="search-bar"><Search size={18}/><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.search} aria-label={t.search}/>{search && <Button variant="ghost" size="icon" aria-label={t.reset} onClick={() => setSearch("")}><X/></Button>}<span className="search-hint">⌕</span></div>
      <div className="list-toolbar"><Tabs value={query.source} onValueChange={(source) => update({ source })}><TabsList><TabsTrigger value="all">{t.all}</TabsTrigger><TabsTrigger value="official">{t.official}</TabsTrigger><TabsTrigger value="community">{t.community}</TabsTrigger></TabsList></Tabs><div className="sort-controls"><Button className="mobile-filter" variant="outline" onClick={() => setFilters(true)}><SlidersHorizontal size={16}/>{t.filters}</Button><Pick label={t.sort} value={query.sort} onChange={(sort) => update({ sort })} options={[["updated", t.updated], ["relevance", t.relevance], ["stars", t.stars], ["downloads", t.downloads], ["name", t.name]]}/></div></div>
      {!client.api && <div className="preview-notice"><Badge variant="outline">{t.local}</Badge><span>{t.localNote}</span></div>}
      <div className="results-meta" aria-live="polite"><span>{page && !error ? `${count(page.total)} ${t.results}` : ""}</span>{hasMetrics && <span title={t.metricNote}><CircleHelp size={13}/>{t.stars} / {t.downloads}</span>}</div>
      <section id="results" aria-label={t.results} aria-busy={loading}>
        {error ? <div className="empty-state" role="alert"><CircleHelp/><h2>{t.error}</h2><p>{error}</p><Button variant="outline" onClick={() => { setCursor(null); setHistory([]); setRetry((n) => n + 1); }}>{t.retry}</Button></div>
        : loading ? <div className="loading-list">{Array.from({ length: 5 }, (_, i) => <div className="loading-row" key={i}><Skeleton className="size-11 rounded-xl"/><div><Skeleton className="h-4 w-40"/><Skeleton className="mt-3 h-3 w-full"/></div></div>)}</div>
        : !page?.items.length ? <div className="empty-state"><Search/><h2>{t.empty}</h2><p>{t.emptyText}</p><Button variant="outline" onClick={reset}>{t.reset}</Button></div>
        : <div className="package-list">{page.items.map((entry) => { const text = display(entry, locale); const date = entry.releasePublishedAt ?? entry.contentChangedAt ?? entry.firstSeenAt; return <article className="package-row" key={entry.key}>
          <div className={`package-icon category-${entry.category}`}>{entry.kind === "worlds" ? <Globe2 size={22}/> : ["narrative", "world"].includes(entry.category) ? <BookOpen size={22}/> : entry.category === "gameplay" ? <Sparkles size={22}/> : <Package size={22}/>}</div>
          <div className="package-info"><div className="package-name"><button onClick={() => openDetails(entry.key)}>{text.name}</button>{entry.official && <span className="official-label">{t.official}</span>}{entry.status !== "indexed" && <Badge variant="outline">{t[entry.status]}</Badge>}</div><p>{text.description || entry.repository}</p><div className="package-meta"><span>{entry.author}</span><span className="meta-dot">·</span><span>{entry.category.replaceAll("-", " ")}</span>{entry.version && <><span className="meta-dot">·</span><span>v{entry.version}</span></>}{date && <><span className="meta-dot">·</span><time dateTime={date} title={entry.releasePublishedAt ? t.published : entry.contentChangedAt ? t.changed : t.firstSeen}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(date))}</time></>}</div></div>
          {hasMetrics && <div className="package-metrics"><span title={t.stars}><Star size={14}/>{count(entry.stars)}</span><span title={t.downloads}><ArrowDownToLine size={14}/>{count(entry.downloadRequests)}</span></div>}<Button variant="ghost" size="icon" className="row-open" onClick={() => openDetails(entry.key)} aria-label={`${t.details}: ${text.name}`}><ArrowRight size={18}/></Button>
        </article>; })}</div>}
      </section>
      {!error && page && (history.length > 0 || page.nextCursor) && <div className="pagination"><Button variant="outline" disabled={!history.length || loading} onClick={() => turnPage(history.at(-1) ?? null, history.slice(0, -1))}><ChevronLeft/>{t.previous}</Button><span>{t.page} {history.length + 1}</span><Button variant="outline" disabled={!page.nextCursor || loading} onClick={() => turnPage(page.nextCursor, [...history, cursor])}>{t.next}<ChevronRight/></Button></div>}
      <div className="contribute-strip"><div><h2>{t.maintain}</h2><p>{t.maintainNote}</p></div><Button variant="ghost" onClick={() => setAdd(true)}>{t.add}<ArrowRight size={16}/></Button></div>
      <footer className="page-footer"><span>{t.indexedNote}</span><a href={`${config.repository}/issues/new`}>{t.report}<ExternalLink size={12}/></a></footer>
    </main>
    <Dialog open={filters} onOpenChange={setFilters}><DialogContent className="filter-dialog" style={{ translate: "none" }}><DialogHeader><DialogTitle>{t.filters}</DialogTitle><DialogDescription>{t[config.kind]}</DialogDescription></DialogHeader>{filterContent}<a href={config.siblingUrl}>{config.kind === "plugins" ? t.worlds : t.plugins}<ArrowRight size={16}/></a><Button onClick={() => setFilters(false)}>{t.close}</Button></DialogContent></Dialog>
    <Dialog open={add} onOpenChange={setAdd}><DialogContent><DialogHeader><DialogTitle>{t.addTitle}</DialogTitle><DialogDescription>{t.addDescription}</DialogDescription></DialogHeader><div className="topic-list">{(config.kind === "plugins" ? ["covel-plugin", "covel-plugins"] : ["covel-world", "covel-worlds"]).map((topic) => <div key={topic}><code>{topic}</code><CopyButton value={topic} t={t}/></div>)}</div><Button asChild><a href={config.guideUrl}>{t.guide}<ArrowRight/></a></Button></DialogContent></Dialog>
    <PackageDialog entryKey={selected} close={closeDetails} client={client} locale={locale} t={t}/>
  </div>;
}
