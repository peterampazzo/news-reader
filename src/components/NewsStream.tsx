import { useEffect, useMemo, useRef, useState } from "react";
import { Settings2, Search, X, ArrowUp, Rows3, Rows4, AlertTriangle, Check } from "lucide-react";
import { SOURCE_CATALOG, DEFAULT_ENABLED, getSource, type SourceConfig } from "@/lib/news-sources";
import { useLocalStorage } from "@/hooks/use-local-storage";

interface Article {
  id: string;
  sourceKey: string;
  title: string;
  snippet: string;
  link: string;
  pubDate: number;
  thumbnail?: string;
  isNew?: boolean;
}

interface FeedStatus {
  ok: boolean;
  error?: string;
  lastTried: number;
}

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

async function fetchSource(src: SourceConfig): Promise<{ articles: Article[]; status: FeedStatus }> {
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
      };
    });
    return { articles, status: { ok: true, lastTried: Date.now() } };
  } catch (err) {
    return {
      articles: [],
      status: { ok: false, error: err instanceof Error ? err.message : "Failed", lastTried: Date.now() },
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

function SourceBadge({ src, dim = false }: { src: SourceConfig; dim?: boolean }) {
  return (
    <span
      className="inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-mono font-semibold tracking-wide uppercase"
      style={{
        backgroundColor: `color-mix(in oklab, ${src.color} ${dim ? 10 : 18}%, transparent)`,
        color: src.color === "oklch(0.55 0.015 250)" ? "oklch(0.85 0.01 250)" : src.color,
        borderColor: `color-mix(in oklab, ${src.color} ${dim ? 25 : 45}%, transparent)`,
      }}
    >
      [{src.label}]
    </span>
  );
}

export function NewsStream() {
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

  const seenRef = useRef<Set<string>>(new Set());
  const sessionStartRef = useRef<number>(lastVisit);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Update "last visit" on unmount/unload
  useEffect(() => {
    const save = () => setLastVisit(Date.now());
    window.addEventListener("beforeunload", save);
    return () => {
      window.removeEventListener("beforeunload", save);
      save();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enabledConfigs = useMemo(
    () => enabledSources.map(getSource).filter(Boolean) as SourceConfig[],
    [enabledSources],
  );

  useEffect(() => {
    let mounted = true;

    const refresh = async (initial: boolean) => {
      const results = await Promise.all(enabledConfigs.map(fetchSource));
      if (!mounted) return;

      const statusMap: Record<string, FeedStatus> = {};
      const merged: Article[] = [];
      results.forEach((r, i) => {
        statusMap[enabledConfigs[i].key] = r.status;
        merged.push(...r.articles);
      });

      // dedup by normalized title
      const seenTitles = new Set<string>();
      const deduped = merged.filter((a) => {
        const norm = a.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 80);
        if (seenTitles.has(norm)) return false;
        seenTitles.add(norm);
        return true;
      });
      deduped.sort((a, b) => b.pubDate - a.pubDate);

      setStatuses(statusMap);

      if (initial) {
        deduped.forEach((a) => seenRef.current.add(a.id));
        setArticles(deduped);
        setLoading(false);
      } else {
        const incoming = deduped.filter((a) => !seenRef.current.has(a.id));
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
      return next.length === 0 ? prev : next; // never allow zero
    });
  };

  const onShowNew = () => {
    setPendingNew(0);
    window.scrollTo({ top: 0, behavior: "smooth" });
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
        {/* Error banner */}
        {Object.entries(statuses).some(([, s]) => !s.ok) && (
          <div className="mb-4 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-[11px] font-mono text-destructive flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold">Feed errors</div>
              {Object.entries(statuses)
                .filter(([, s]) => !s.ok)
                .map(([k, s]) => (
                  <div key={k}>
                    {getSource(k)?.label}: {s.error}
                  </div>
                ))}
            </div>
          </div>
        )}

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
              const src = getSource(a.sourceKey);
              if (!src) return null;
              const isUnread = a.pubDate > sessionStartRef.current;
              return (
                <li key={a.id}>
                  <a
                    href={a.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={[
                      "group relative block rounded-md border bg-card transition-all hover:bg-accent hover:border-border/80",
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
                      <time className="text-[10px] font-mono text-muted-foreground tabular-nums">
                        {relativeTime(a.pubDate, now)}
                      </time>
                    </div>
                    <div className={density === "compact" ? "mt-1.5 flex gap-3" : "mt-2 flex gap-3"}>
                      {a.thumbnail && density !== "compact" && (
                        <img
                          src={a.thumbnail}
                          alt=""
                          loading="lazy"
                          className="h-16 w-16 rounded object-cover border border-border shrink-0"
                          onError={(e) => ((e.currentTarget.style.display = "none"))}
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <h2
                          className={[
                            "leading-snug font-medium text-card-foreground group-hover:text-primary transition-colors",
                            density === "compact" ? "text-[13px]" : "text-[15px]",
                          ].join(" ")}
                        >
                          {highlight(a.title, query)}
                        </h2>
                        {a.snippet && density !== "compact" && (
                          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground line-clamp-2">
                            {highlight(a.snippet, query)}
                          </p>
                        )}
                      </div>
                    </div>
                  </a>
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
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
  color,
  error,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  color?: string;
  error?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "rounded-full border px-2.5 py-0.5 text-[10px] font-mono uppercase tracking-wide transition-colors",
        active
          ? "border-foreground/60 bg-foreground text-background"
          : "border-border bg-transparent text-muted-foreground hover:text-foreground hover:border-foreground/40",
      ].join(" ")}
      style={active && color ? { backgroundColor: color, color: "var(--background)", borderColor: color } : undefined}
    >
      {error && !active && <span className="text-destructive mr-1">!</span>}
      {label}
    </button>
  );
}

function SettingsPanel({
  enabled,
  onToggle,
  onClose,
}: {
  enabled: string[];
  onToggle: (k: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm flex items-center justify-center p-4 animate-stream-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-mono text-sm uppercase tracking-widest">// sources</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {SOURCE_CATALOG.map((src) => {
            const on = enabled.includes(src.key);
            return (
              <button
                key={src.key}
                onClick={() => onToggle(src.key)}
                className="w-full flex items-center justify-between gap-3 rounded px-3 py-2.5 text-left hover:bg-accent transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: src.color }} />
                  <span className="text-sm text-card-foreground truncate">{src.label}</span>
                </div>
                <span
                  className={[
                    "h-5 w-5 rounded border flex items-center justify-center shrink-0",
                    on ? "border-[var(--status-live)] bg-[color-mix(in_oklab,var(--status-live)_20%,transparent)]" : "border-border",
                  ].join(" ")}
                >
                  {on && <Check className="h-3 w-3 text-[var(--status-live)]" />}
                </span>
              </button>
            );
          })}
        </div>
        <div className="border-t border-border px-4 py-2.5 text-[10px] font-mono text-muted-foreground">
          saved locally · {enabled.length} active
        </div>
      </div>
    </div>
  );
}
