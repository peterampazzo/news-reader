import { useEffect, useMemo, useRef, useState } from "react";
import {
  Settings2, Search, X, ArrowUp, Rows3, Rows4, Check, Languages,
  ChevronDown, Plus, Trash2, ImageOff, Loader2, AlertTriangle,
} from "lucide-react";
import {
  SOURCE_CATALOG, DEFAULT_ENABLED, CATEGORY_META, CATEGORY_ORDER,
  buildCatalog, getSource, type SourceConfig, type SourceCategory,
  type CustomSource,
} from "@/lib/news-sources";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { translateText } from "@/lib/translate";
import { isNearDuplicate, tokenize } from "@/lib/similarity";

interface Article {
  id: string;
  sourceKey: string;
  title: string;
  snippet: string;
  link: string;
  pubDate: number;
  thumbnail?: string;
  lang?: string;
  isNew?: boolean;
}

interface FeedStatus {
  ok: boolean;
  error?: string;
  lastTried: number;
  lastSuccess?: number;
}

const USER_LANG = "en"; // target translation language

function stripHtml(html: string): string {
  if (!html) return "";
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function relativeTime(ts: number, now: number): string {
  const diff = Math.max(0, Math.floor((now - ts) / 1000));
  if (diff < 60) return `${diff}s ago`;
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function extractThumbnail(item: any): string | undefined {
  if (item.thumbnail && typeof item.thumbnail === "string" && item.thumbnail.startsWith("http")) return item.thumbnail;
  if (item.enclosure?.link) return item.enclosure.link;
  const html = (item.content || item.description || "") as string;
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m?.[1];
}

function proxyImage(url: string): string {
  // weserv.nl: protocol-less URL, http/https supported, mitigates mixed content + some CORS
  const stripped = url.replace(/^https?:\/\//, "");
  return `https://images.weserv.nl/?url=${encodeURIComponent(stripped)}&w=160&h=160&fit=cover&output=webp`;
}

async function fetchSource(src: SourceConfig): Promise<{ articles: Article[]; status: FeedStatus }> {
  const tried = Date.now();
  try {
    const res = await fetch(src.feedUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.status && json.status !== "ok") throw new Error(json.message || "Feed error");
    if (!Array.isArray(json?.items)) throw new Error("Bad payload");
    const articles = json.items.slice(0, 25).map((item: any, idx: number): Article => {
      const raw = item.pubDate ? new Date(item.pubDate.replace(" ", "T") + "Z").getTime() : Date.now();
      return {
        id: `${src.key}-${item.guid || item.link || idx}`,
        sourceKey: src.key,
        title: stripHtml(item.title || "Untitled"),
        snippet: stripHtml(item.description || item.content || "").slice(0, 220),
        link: item.link || "#",
        pubDate: Number.isFinite(raw) ? raw : Date.now(),
        thumbnail: extractThumbnail(item),
        lang: src.lang,
      };
    });
    return { articles, status: { ok: true, lastTried: tried, lastSuccess: tried } };
  } catch (err) {
    return {
      articles: [],
      status: { ok: false, error: err instanceof Error ? err.message : "Failed", lastTried: tried },
    };
  }
}

function highlight(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const q = query.trim();
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"));
  return parts.map((p, i) =>
    p.toLowerCase() === q.toLowerCase() ? <mark key={i} className="hl">{p}</mark> : <span key={i}>{p}</span>,
  );
}

function SourceBadge({ src }: { src: SourceConfig }) {
  return (
    <span
      className="inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-mono font-semibold tracking-wide uppercase"
      style={{
        backgroundColor: `color-mix(in oklab, ${src.color} 18%, transparent)`,
        color: src.color,
        borderColor: `color-mix(in oklab, ${src.color} 45%, transparent)`,
      }}
    >
      [{src.label}]
    </span>
  );
}

export function NewsStream() {
  const [customSources, setCustomSources] = useLocalStorage<CustomSource[]>("ns:custom-sources", []);
  const [enabledSources, setEnabledSources] = useLocalStorage<string[]>("ns:enabled-sources", DEFAULT_ENABLED);
  const [activeFilter, setActiveFilter] = useLocalStorage<string>("ns:active-filter", "all");
  const [density, setDensity] = useLocalStorage<"comfortable" | "compact">("ns:density", "comfortable");
  const [lastVisit, setLastVisit] = useLocalStorage<number>("ns:last-visit", Date.now());
  const [query, setQuery] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [articles, setArticles] = useState<Article[]>([]);
  const [statuses, setStatuses] = useState<Record<string, FeedStatus>>({});
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [pendingNew, setPendingNew] = useState(0);
  // per-article translation state: { [id]: { title, snippet, loading, error, shown } }
  const [translations, setTranslations] = useState<
    Record<string, { title?: string; snippet?: string; loading?: boolean; error?: string; shown?: boolean }>
  >({});

  const seenRef = useRef<Set<string>>(new Set());
  const sessionStartRef = useRef<number>(lastVisit);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const save = () => setLastVisit(Date.now());
    window.addEventListener("beforeunload", save);
    return () => {
      window.removeEventListener("beforeunload", save);
      save();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fullCatalog = useMemo(() => buildCatalog(customSources), [customSources]);
  const enabledConfigs = useMemo(
    () => enabledSources.map((k) => fullCatalog.find((s) => s.key === k)).filter(Boolean) as SourceConfig[],
    [enabledSources, fullCatalog],
  );

  useEffect(() => {
    let mounted = true;

    const refresh = async (initial: boolean) => {
      const results = await Promise.all(enabledConfigs.map(fetchSource));
      if (!mounted) return;

      const statusMap: Record<string, FeedStatus> = {};
      const merged: Article[] = [];
      results.forEach((r, i) => {
        const prev = statuses[enabledConfigs[i].key];
        statusMap[enabledConfigs[i].key] = {
          ...r.status,
          lastSuccess: r.status.lastSuccess ?? prev?.lastSuccess,
        };
        merged.push(...r.articles);
      });

      // Token-based dedup: walk newest→oldest, drop near-duplicate titles already kept
      merged.sort((a, b) => b.pubDate - a.pubDate);
      const kept: Article[] = [];
      const keptTokens: string[][] = [];
      for (const a of merged) {
        const toks = tokenize(a.title);
        let dup = false;
        for (let i = 0; i < keptTokens.length; i++) {
          if (isNearDuplicate(a.title, kept[i].title)) { dup = true; break; }
        }
        if (!dup) { kept.push(a); keptTokens.push(toks); }
      }

      setStatuses(statusMap);

      if (initial) {
        kept.forEach((a) => seenRef.current.add(a.id));
        setArticles(kept);
        setLoading(false);
      } else {
        const incoming = kept.filter((a) => !seenRef.current.has(a.id));
        if (incoming.length > 0) {
          incoming.forEach((a) => seenRef.current.add(a.id));
          const tagged = incoming.map((a) => ({ ...a, isNew: true }));
          setArticles((prev) => {
            const combined = [...tagged, ...prev];
            combined.sort((a, b) => b.pubDate - a.pubDate);
            return combined.slice(0, 300);
          });
          if ((scrollerRef.current?.scrollTop ?? window.scrollY) > 400) {
            setPendingNew((p) => p + incoming.length);
          }
        }
      }
      setLastUpdate(Date.now());
    };

    setLoading(true);
    seenRef.current = new Set();
    refresh(true);
    const poll = setInterval(() => refresh(false), 45_000);
    const tick = setInterval(() => setNow(Date.now()), 30_000);

    return () => {
      mounted = false;
      clearInterval(poll);
      clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabledConfigs]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return articles.filter((a) => {
      if (activeFilter !== "all" && a.sourceKey !== activeFilter) return false;
      if (q && !a.title.toLowerCase().includes(q) && !a.snippet.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [articles, activeFilter, query]);

  const unreadCount = useMemo(
    () => visible.filter((a) => a.pubDate > sessionStartRef.current).length,
    [visible],
  );

  const toggleSource = (key: string) => {
    setEnabledSources((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      return next.length === 0 ? prev : next;
    });
  };
  const setCategoryAll = (cat: SourceCategory, on: boolean) => {
    const keys = fullCatalog.filter((s) => s.category === cat).map((s) => s.key);
    setEnabledSources((prev) => {
      const set = new Set(prev);
      if (on) keys.forEach((k) => set.add(k));
      else keys.forEach((k) => set.delete(k));
      const next = Array.from(set);
      return next.length === 0 ? prev : next;
    });
  };

  const onShowNew = () => {
    setPendingNew(0);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleTranslate = async (a: Article) => {
    const existing = translations[a.id];
    if (existing?.title) {
      // toggle showing
      setTranslations((p) => ({ ...p, [a.id]: { ...existing, shown: !existing.shown } }));
      return;
    }
    setTranslations((p) => ({ ...p, [a.id]: { loading: true, shown: true } }));
    try {
      const from = a.lang || "auto";
      const [t, s] = await Promise.all([
        translateText(a.title, from, USER_LANG),
        a.snippet ? translateText(a.snippet, from, USER_LANG) : Promise.resolve(""),
      ]);
      setTranslations((p) => ({ ...p, [a.id]: { title: t, snippet: s, loading: false, shown: true } }));
    } catch (err) {
      setTranslations((p) => ({
        ...p,
        [a.id]: { loading: false, shown: true, error: err instanceof Error ? err.message : "Translation failed" },
      }));
    }
  };

  return (
    <div className="min-h-screen text-foreground">
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-background/80 border-b border-border">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 py-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span
              className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-mono"
              style={{
                borderColor: "color-mix(in oklab, var(--status-live) 45%, transparent)",
                backgroundColor: "color-mix(in oklab, var(--status-live) 14%, transparent)",
                color: "var(--status-live)",
              }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full animate-pulse-dot"
                style={{ backgroundColor: "var(--status-live)", boxShadow: "0 0 8px var(--status-live)" }}
              />
              Active Stream: Listening
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setDensity(density === "comfortable" ? "compact" : "comfortable")}
                className="rounded border border-border p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title={`Density: ${density}`}
              >
                {density === "comfortable" ? <Rows3 className="h-3.5 w-3.5" /> : <Rows4 className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={() => setSettingsOpen(true)}
                className="rounded border border-border p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title="Sources"
              >
                <Settings2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="grep stream…"
              className="w-full rounded border border-border bg-muted/40 pl-8 pr-8 py-1.5 text-xs font-mono placeholder:text-muted-foreground/60 focus:outline-none focus:border-ring transition-colors"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <FilterChip label="All" active={activeFilter === "all"} onClick={() => setActiveFilter("all")} />
            {enabledConfigs.map((src) => (
              <FilterChip
                key={src.key}
                label={src.label}
                color={src.color}
                active={activeFilter === src.key}
                error={statuses[src.key] && !statuses[src.key].ok}
                onClick={() => setActiveFilter(src.key)}
              />
            ))}
          </div>

          <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground tabular-nums">
            <span>
              {unreadCount > 0 ? (
                <span className="text-[var(--status-live)]">● {unreadCount} new since last visit</span>
              ) : (
                <span>// no new since {relativeTime(sessionStartRef.current, now)}</span>
              )}
            </span>
            <span>{lastUpdate ? `sync · ${relativeTime(lastUpdate, now)}` : "syncing…"}</span>
          </div>
        </div>
      </header>

      {pendingNew > 0 && (
        <div className="sticky top-[var(--header-h,140px)] z-20 flex justify-center pointer-events-none">
          <button
            onClick={onShowNew}
            className="pointer-events-auto mt-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-mono shadow-lg animate-stream-in"
            style={{
              backgroundColor: "color-mix(in oklab, var(--status-live) 22%, var(--background))",
              borderColor: "color-mix(in oklab, var(--status-live) 50%, transparent)",
              color: "var(--status-live)",
            }}
          >
            <ArrowUp className="h-3.5 w-3.5" />
            {pendingNew} new article{pendingNew === 1 ? "" : "s"}
          </button>
        </div>
      )}

      <main ref={scrollerRef} className="mx-auto max-w-2xl px-4 sm:px-6 py-6">
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-24 rounded-md border border-border bg-card/40 animate-pulse"
                style={{ animationDelay: `${i * 80}ms` }}
              />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-card/30 px-6 py-12 text-center text-xs font-mono text-muted-foreground">
            no results · adjust filters or query
          </div>
        ) : (
          <ol className="space-y-2.5">
            {visible.map((a) => {
              const src = getSource(a.sourceKey, customSources);
              if (!src) return null;
              const isUnread = a.pubDate > sessionStartRef.current;
              const tr = translations[a.id];
              const showTranslated = !!tr?.shown && !!tr?.title;
              const displayTitle = showTranslated ? tr!.title! : a.title;
              const displaySnippet = showTranslated && tr?.snippet ? tr.snippet : a.snippet;
              const canTranslate = a.lang && a.lang !== USER_LANG;
              return (
                <li key={a.id}>
                  <div
                    className={[
                      "group relative block rounded-md border bg-card transition-all hover:bg-accent/40 hover:border-border/80",
                      density === "compact" ? "px-3 py-2.5" : "px-4 py-3.5",
                      a.isNew ? "animate-stream-in" : "",
                      isUnread ? "border-[color-mix(in_oklab,var(--status-live)_30%,var(--border))]" : "border-border",
                    ].join(" ")}
                  >
                    {isUnread && (
                      <span
                        className="absolute left-0 top-3 h-[calc(100%-1.5rem)] w-[2px] rounded-r"
                        style={{ backgroundColor: "var(--status-live)" }}
                      />
                    )}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <SourceBadge src={src} />
                        {isUnread && (
                          <span className="text-[9px] font-mono uppercase tracking-wider text-[var(--status-live)]">
                            ● new
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {canTranslate && (
                          <button
                            onClick={(e) => { e.preventDefault(); handleTranslate(a); }}
                            className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                            title={showTranslated ? "Show original" : `Translate from ${a.lang}`}
                          >
                            {tr?.loading ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Languages className="h-3 w-3" />
                            )}
                            {showTranslated ? "original" : (a.lang ?? "tr").toUpperCase()}
                          </button>
                        )}
                        <time className="text-[10px] font-mono text-muted-foreground tabular-nums">
                          {relativeTime(a.pubDate, now)}
                        </time>
                      </div>
                    </div>
                    <a
                      href={a.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={density === "compact" ? "mt-1.5 flex gap-3" : "mt-2 flex gap-3"}
                    >
                      {density !== "compact" && (
                        <Thumbnail src={a.thumbnail} alt="" srcColor={src.color} />
                      )}
                      <div className="min-w-0 flex-1">
                        {tr?.loading ? (
                          <>
                            <div className="skeleton-shimmer h-4 w-3/4 mb-2" />
                            <div className="skeleton-shimmer h-3 w-full mb-1" />
                            <div className="skeleton-shimmer h-3 w-5/6" />
                          </>
                        ) : (
                          <>
                            <h2
                              className={[
                                "leading-snug font-medium text-card-foreground group-hover:text-primary transition-colors",
                                density === "compact" ? "text-[13px]" : "text-[15px]",
                              ].join(" ")}
                            >
                              {highlight(displayTitle, query)}
                            </h2>
                            {displaySnippet && density !== "compact" && (
                              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground line-clamp-2">
                                {highlight(displaySnippet, query)}
                              </p>
                            )}
                            {tr?.error && (
                              <p className="mt-1 text-[10px] font-mono text-destructive">⚠ {tr.error}</p>
                            )}
                          </>
                        )}
                      </div>
                    </a>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        <footer className="mt-10 mb-6 text-center text-[10px] font-mono text-muted-foreground/60 tracking-widest">
          — end of stream · {visible.length} item{visible.length === 1 ? "" : "s"} —
        </footer>
      </main>

      {settingsOpen && (
        <SettingsPanel
          enabled={enabledSources}
          onToggle={toggleSource}
          onCategoryAll={setCategoryAll}
          onClose={() => setSettingsOpen(false)}
          statuses={statuses}
          customSources={customSources}
          setCustomSources={setCustomSources}
          fullCatalog={fullCatalog}
        />
      )}
    </div>
  );
}

function Thumbnail({ src, alt, srcColor }: { src?: string; alt: string; srcColor: string }) {
  const [stage, setStage] = useState<"direct" | "proxy" | "failed">("direct");
  if (!src) return null;
  if (stage === "failed") {
    return (
      <div
        className="h-16 w-16 rounded border border-border shrink-0 flex items-center justify-center"
        style={{ backgroundColor: `color-mix(in oklab, ${srcColor} 14%, transparent)` }}
      >
        <ImageOff className="h-5 w-5" style={{ color: srcColor }} />
      </div>
    );
  }
  const url = stage === "direct" ? src : proxyImage(src);
  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      className="h-16 w-16 rounded object-cover border border-border shrink-0 bg-muted/40"
      onError={() => setStage(stage === "direct" ? "proxy" : "failed")}
    />
  );
}

function FilterChip({
  label, active, onClick, color, error,
}: {
  label: string; active: boolean; onClick: () => void; color?: string; error?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-mono uppercase tracking-wide transition-colors",
        active
          ? "border-foreground/60 bg-foreground text-background"
          : "border-border bg-transparent text-muted-foreground hover:text-foreground hover:border-foreground/40",
      ].join(" ")}
      style={active && color ? { backgroundColor: color, color: "var(--background)", borderColor: color } : undefined}
      title={error ? "Feed error — last fetch failed" : undefined}
    >
      {error && !active && <AlertTriangle className="h-2.5 w-2.5 text-destructive" />}
      {label}
    </button>
  );
}

function SettingsPanel({
  enabled, onToggle, onCategoryAll, onClose, statuses, customSources, setCustomSources, fullCatalog,
}: {
  enabled: string[];
  onToggle: (k: string) => void;
  onCategoryAll: (cat: SourceCategory, on: boolean) => void;
  onClose: () => void;
  statuses: Record<string, FeedStatus>;
  customSources: CustomSource[];
  setCustomSources: (v: CustomSource[] | ((p: CustomSource[]) => CustomSource[])) => void;
  fullCatalog: SourceConfig[];
}) {
  const [openCat, setOpenCat] = useState<SourceCategory | null>("danish");

  // custom form state
  const [cLabel, setCLabel] = useState("");
  const [cUrl, setCUrl] = useState("");
  const [cColor, setCColor] = useState("oklch(0.7 0.18 200)");
  const [cLang, setCLang] = useState("en");
  const [formError, setFormError] = useState<string | null>(null);

  const addCustom = () => {
    setFormError(null);
    const label = cLabel.trim();
    const url = cUrl.trim();
    if (!label || !url) { setFormError("Label and URL are required"); return; }
    try { new URL(url); } catch { setFormError("Invalid URL"); return; }
    const key = `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const next: CustomSource = { key, label, rssUrl: url, color: cColor, lang: cLang || undefined };
    setCustomSources((p) => [...p, next]);
    setCLabel(""); setCUrl("");
  };

  const removeCustom = (key: string) => {
    setCustomSources((p) => p.filter((c) => c.key !== key));
  };

  const grouped: Record<SourceCategory, SourceConfig[]> = {
    italian: [], danish: [], international: [], tech: [], custom: [],
  };
  fullCatalog.forEach((s) => { grouped[s.category].push(s); });

  return (
    <div
      className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm flex items-center justify-center p-4 animate-stream-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-border bg-card shadow-2xl flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3 shrink-0">
          <h2 className="font-mono text-sm uppercase tracking-widest">// sources</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto thin-scroll flex-1 p-2 space-y-1">
          {CATEGORY_ORDER.map((cat) => {
            const items = grouped[cat];
            const meta = CATEGORY_META[cat];
            const open = openCat === cat;
            const enabledCount = items.filter((s) => enabled.includes(s.key)).length;
            return (
              <div key={cat} className="rounded border border-border bg-background/40">
                <button
                  onClick={() => setOpenCat(open ? null : cat)}
                  className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-accent/40 transition-colors"
                >
                  <span className="flex items-center gap-2 text-sm">
                    <span>{meta.emoji}</span>
                    <span className="font-medium">{meta.label}</span>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {enabledCount}/{items.length}
                    </span>
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
                  />
                </button>
                {open && (
                  <div className="border-t border-border px-2 pt-2 pb-2">
                    {cat !== "custom" && items.length > 0 && (
                      <div className="flex items-center gap-2 px-1 pb-2 text-[10px] font-mono">
                        <button
                          onClick={() => onCategoryAll(cat, true)}
                          className="text-muted-foreground hover:text-[var(--status-live)] underline-offset-2 hover:underline"
                        >
                          select all
                        </button>
                        <span className="text-muted-foreground/50">·</span>
                        <button
                          onClick={() => onCategoryAll(cat, false)}
                          className="text-muted-foreground hover:text-destructive underline-offset-2 hover:underline"
                        >
                          deselect all
                        </button>
                      </div>
                    )}
                    <div className={`grid grid-cols-1 gap-1 ${items.length > 4 ? "max-h-56 overflow-y-auto thin-scroll fade-mask pr-1" : ""}`}>
                      {items.map((src) => {
                        const on = enabled.includes(src.key);
                        const status = statuses[src.key];
                        const hasError = status && !status.ok;
                        const isCustom = src.custom;
                        return (
                          <div
                            key={src.key}
                            className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent/40 transition-colors"
                          >
                            <button
                              onClick={() => onToggle(src.key)}
                              className="flex items-center gap-2 flex-1 min-w-0 text-left"
                            >
                              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: src.color }} />
                              <span className="text-sm text-card-foreground truncate">{src.label}</span>
                              {hasError && (
                                <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />
                              )}
                              <span
                                className={[
                                  "ml-auto h-4 w-4 rounded border flex items-center justify-center shrink-0",
                                  on
                                    ? "border-[var(--status-live)] bg-[color-mix(in_oklab,var(--status-live)_22%,transparent)]"
                                    : "border-border",
                                ].join(" ")}
                              >
                                {on && <Check className="h-2.5 w-2.5 text-[var(--status-live)]" />}
                              </span>
                            </button>
                            {isCustom && (
                              <button
                                onClick={() => removeCustom(src.key)}
                                className="text-muted-foreground hover:text-destructive p-1"
                                title="Remove custom feed"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                      {cat === "custom" && items.length === 0 && (
                        <p className="text-[11px] font-mono text-muted-foreground px-2 py-1">
                          no custom feeds yet — add one below
                        </p>
                      )}
                    </div>

                    {cat === "custom" && (
                      <div className="mt-3 border-t border-border pt-3 space-y-2">
                        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                          + add custom feed
                        </div>
                        <input
                          value={cLabel}
                          onChange={(e) => setCLabel(e.target.value)}
                          placeholder="Label (e.g. My Blog)"
                          className="w-full rounded border border-border bg-muted/40 px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-ring"
                        />
                        <input
                          value={cUrl}
                          onChange={(e) => setCUrl(e.target.value)}
                          placeholder="https://example.com/feed.xml"
                          className="w-full rounded border border-border bg-muted/40 px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-ring"
                        />
                        <div className="flex items-center gap-2">
                          <label className="text-[10px] font-mono text-muted-foreground">color</label>
                          <div className="flex gap-1">
                            {[
                              "oklch(0.7 0.18 200)", "oklch(0.7 0.2 50)", "oklch(0.65 0.22 25)",
                              "oklch(0.7 0.2 320)", "oklch(0.75 0.2 140)", "oklch(0.85 0.005 250)",
                            ].map((c) => (
                              <button
                                key={c}
                                onClick={() => setCColor(c)}
                                className={`h-5 w-5 rounded-full border-2 transition ${cColor === c ? "border-foreground" : "border-transparent"}`}
                                style={{ backgroundColor: c }}
                              />
                            ))}
                          </div>
                          <select
                            value={cLang}
                            onChange={(e) => setCLang(e.target.value)}
                            className="ml-auto rounded border border-border bg-muted/40 px-2 py-1 text-[10px] font-mono"
                          >
                            <option value="en">en</option>
                            <option value="it">it</option>
                            <option value="da">da</option>
                            <option value="de">de</option>
                            <option value="fr">fr</option>
                            <option value="es">es</option>
                          </select>
                        </div>
                        {formError && (
                          <p className="text-[10px] font-mono text-destructive">⚠ {formError}</p>
                        )}
                        <button
                          onClick={addCustom}
                          className="w-full inline-flex items-center justify-center gap-1 rounded border border-[var(--status-live)]/50 bg-[color-mix(in_oklab,var(--status-live)_15%,transparent)] px-2 py-1.5 text-xs font-mono text-[var(--status-live)] hover:bg-[color-mix(in_oklab,var(--status-live)_25%,transparent)] transition-colors"
                        >
                          <Plus className="h-3.5 w-3.5" /> add feed
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="border-t border-border px-4 py-2.5 text-[10px] font-mono text-muted-foreground shrink-0 flex items-center justify-between">
          <span>saved locally · {enabled.length} active</span>
          <span>{SOURCE_CATALOG.length + customSources.length} total</span>
        </div>
      </div>
    </div>
  );
}
