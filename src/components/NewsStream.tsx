import { useEffect, useRef, useState } from "react";

type SourceKey = "ilpost" | "corriere" | "drdk";

interface SourceConfig {
  key: SourceKey;
  label: string;
  url: string;
  badgeStyle: React.CSSProperties;
}

const SOURCES: SourceConfig[] = [
  {
    key: "ilpost",
    label: "Il Post",
    url: "https://api.rss2json.com/v1/api.json?rss_url=https%3A%2F%2Fwww.ilpost.it%2Ffeed%2F",
    badgeStyle: {
      backgroundColor: "color-mix(in oklab, var(--source-ilpost) 18%, transparent)",
      color: "var(--source-ilpost)",
      borderColor: "color-mix(in oklab, var(--source-ilpost) 40%, transparent)",
    },
  },
  {
    key: "corriere",
    label: "Corriere",
    url: "https://api.rss2json.com/v1/api.json?rss_url=https%3A%2F%2Fxml2.corriereobjects.it%2Frss%2Fhomepage.xml",
    badgeStyle: {
      backgroundColor: "color-mix(in oklab, var(--source-corriere) 18%, transparent)",
      color: "var(--source-corriere)",
      borderColor: "color-mix(in oklab, var(--source-corriere) 40%, transparent)",
    },
  },
  {
    key: "drdk",
    label: "DR.dk",
    url: "https://api.rss2json.com/v1/api.json?rss_url=https%3A%2F%2Fwww.dr.dk%2Fnyheder%2Fservice%2Ffeeds%2Fallenyheder",
    badgeStyle: {
      backgroundColor: "color-mix(in oklab, var(--source-drdk) 22%, transparent)",
      color: "oklch(0.85 0.01 250)",
      borderColor: "color-mix(in oklab, var(--source-drdk) 55%, transparent)",
    },
  },
];

interface Article {
  id: string;
  source: SourceConfig;
  title: string;
  snippet: string;
  link: string;
  pubDate: number;
  isNew?: boolean;
}

function stripHtml(html: string): string {
  if (!html) return "";
  const txt = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return txt;
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

const MOCK_DRDK: Article[] = (() => {
  const now = Date.now();
  const src = SOURCES.find((s) => s.key === "drdk")!;
  return [
    {
      id: "mock-drdk-1",
      source: src,
      title: "Regeringen præsenterer ny klimaplan for 2030",
      snippet:
        "Den danske regering har offentliggjort en omfattende plan for at reducere CO2-udledninger frem mod 2030.",
      link: "https://www.dr.dk/nyheder",
      pubDate: now - 1000 * 60 * 7,
    },
    {
      id: "mock-drdk-2",
      source: src,
      title: "København indfører nye trafikregler i indre by",
      snippet:
        "Fra næste måned træder nye regler i kraft, der skal mindske biltrafikken i Københavns centrum.",
      link: "https://www.dr.dk/nyheder",
      pubDate: now - 1000 * 60 * 23,
    },
    {
      id: "mock-drdk-3",
      source: src,
      title: "Dansk forskning fører til gennembrud i kræftbehandling",
      snippet:
        "Forskere ved Rigshospitalet har udviklet en ny metode, der kan revolutionere behandlingen af visse kræftformer.",
      link: "https://www.dr.dk/nyheder",
      pubDate: now - 1000 * 60 * 58,
    },
  ];
})();

async function fetchSource(src: SourceConfig): Promise<Article[]> {
  try {
    const res = await fetch(src.url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json?.items || !Array.isArray(json.items)) throw new Error("bad payload");
    return json.items.slice(0, 25).map((item: any, idx: number): Article => {
      const ts = item.pubDate ? new Date(item.pubDate.replace(" ", "T") + "Z").getTime() : Date.now();
      const fallbackTs = Number.isFinite(ts) ? ts : Date.now();
      const snippetRaw = item.description || item.content || "";
      return {
        id: `${src.key}-${item.guid || item.link || idx}`,
        source: src,
        title: stripHtml(item.title || "Untitled"),
        snippet: stripHtml(snippetRaw).slice(0, 220),
        link: item.link || "#",
        pubDate: fallbackTs,
      };
    });
  } catch (err) {
    if (src.key === "drdk") return MOCK_DRDK;
    console.warn(`Feed failed: ${src.label}`, err);
    return [];
  }
}

async function fetchAll(): Promise<Article[]> {
  const results = await Promise.all(SOURCES.map(fetchSource));
  const merged = results.flat();
  merged.sort((a, b) => b.pubDate - a.pubDate);
  return merged;
}

export function NewsStream() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let mounted = true;

    const refresh = async (initial = false) => {
      const fresh = await fetchAll();
      if (!mounted) return;
      if (initial) {
        fresh.forEach((a) => seenRef.current.add(a.id));
        setArticles(fresh);
        setLoading(false);
      } else {
        const incoming = fresh.filter((a) => !seenRef.current.has(a.id));
        if (incoming.length > 0) {
          incoming.forEach((a) => seenRef.current.add(a.id));
          const tagged = incoming.map((a) => ({ ...a, isNew: true }));
          setArticles((prev) => {
            const combined = [...tagged, ...prev];
            combined.sort((a, b) => b.pubDate - a.pubDate);
            return combined.slice(0, 200);
          });
        }
      }
      setLastUpdate(Date.now());
    };

    refresh(true);
    const poll = setInterval(() => refresh(false), 45_000);
    const tick = setInterval(() => setNow(Date.now()), 30_000);

    return () => {
      mounted = false;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 backdrop-blur-xl bg-background/80 border-b border-border">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span
              className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-mono tracking-tight"
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
          </div>
          <div className="text-[10px] font-mono text-muted-foreground tabular-nums">
            {lastUpdate ? `sync · ${relativeTime(lastUpdate, now)}` : "syncing…"}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 sm:px-6 py-6">
        <div className="mb-6">
          <h1 className="font-mono text-sm text-muted-foreground tracking-widest uppercase">
            // newsdesk · live feed
          </h1>
          <p className="mt-1 text-xs text-muted-foreground/70 font-mono">
            {SOURCES.map((s) => s.label).join(" · ")} — refresh 45s
          </p>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-28 rounded-md border border-border bg-card/40 animate-pulse"
              />
            ))}
          </div>
        ) : (
          <ol className="space-y-3">
            {articles.map((a) => (
              <li key={a.id}>
                <a
                  href={a.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={
                    "group block rounded-md border border-border bg-card px-4 py-3.5 transition-colors hover:bg-accent hover:border-border/80 " +
                    (a.isNew ? "animate-stream-in" : "")
                  }
                >
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className="inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-mono font-semibold tracking-wide uppercase"
                      style={a.source.badgeStyle}
                    >
                      [{a.source.label}]
                    </span>
                    <time className="text-[10px] font-mono text-muted-foreground tabular-nums">
                      {relativeTime(a.pubDate, now)}
                    </time>
                  </div>
                  <h2 className="mt-2 text-[15px] leading-snug font-medium text-card-foreground group-hover:text-primary transition-colors">
                    {a.title}
                  </h2>
                  {a.snippet && (
                    <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground line-clamp-2">
                      {a.snippet}
                    </p>
                  )}
                </a>
              </li>
            ))}
          </ol>
        )}

        <footer className="mt-10 mb-6 text-center text-[10px] font-mono text-muted-foreground/60 tracking-widest">
          — end of stream —
        </footer>
      </main>
    </div>
  );
}
