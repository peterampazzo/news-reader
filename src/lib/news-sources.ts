export type SourceCategory = "italian" | "danish" | "international" | "tech" | "custom";

export interface SourceConfig {
  key: string;
  label: string;
  rssUrl: string; // raw RSS feed URL (used for proxy/fallback)
  feedUrl: string; // primary fetch URL (rss2json wrapper)
  color: string; // oklch
  category: SourceCategory;
  lang?: string; // ISO 639-1 (used to decide if "translate" is offered)
  custom?: boolean;
}

export const rssApi = (rss: string) =>
  `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rss)}`;

export const feednamiApi = (rss: string) =>
  `https://api.feednami.com/api/v1/public/feed?url=${encodeURIComponent(rss)}`;

export const CATEGORY_META: Record<SourceCategory, { label: string; emoji: string }> = {
  italian: { label: "Italian Media", emoji: "🇮🇹" },
  danish: { label: "Danish Media", emoji: "🇩🇰" },
  international: { label: "International", emoji: "🌍" },
  tech: { label: "Tech", emoji: "💻" },
  custom: { label: "My Custom Feeds", emoji: "⭐" },
};

export const CATEGORY_ORDER: SourceCategory[] = [
  "danish",
  "italian",
  "international",
  "tech",
  "custom",
];

function mk(
  key: string,
  label: string,
  rssUrl: string,
  color: string,
  category: SourceCategory,
  lang?: string,
): SourceConfig {
  return { key, label, rssUrl, feedUrl: rssApi(rssUrl), color, category, lang };
}

export const SOURCE_CATALOG: SourceConfig[] = [
  // Italian
  mk("ilpost", "Il Post", "https://www.ilpost.it/feed/", "oklch(0.62 0.18 245)", "italian", "it"),
  mk(
    "corriere",
    "Corriere",
    "https://xml2.corriereobjects.it/rss/homepage.xml",
    "oklch(0.62 0.22 25)",
    "italian",
    "it",
  ),
  mk(
    "repubblica",
    "Repubblica",
    "https://www.repubblica.it/rss/homepage/rss2.0.xml",
    "oklch(0.65 0.2 35)",
    "italian",
    "it",
  ),
  mk(
    "ansa",
    "ANSA",
    "https://www.ansa.it/sito/ansait_rss.xml",
    "oklch(0.6 0.18 60)",
    "italian",
    "it",
  ),
  mk(
    "sole24",
    "Il Sole 24 Ore",
    "https://www.ilsole24ore.com/rss/home.xml",
    "oklch(0.72 0.16 80)",
    "italian",
    "it",
  ),

  // Danish
  mk(
    "drdk",
    "DR.dk",
    "https://www.dr.dk/nyheder/service/feeds/allenyheder",
    "oklch(0.7 0.02 250)",
    "danish",
    "da",
  ),
  mk(
    "politiken",
    "Politiken",
    "https://politiken.dk/rss/senestenyt.rss",
    "oklch(0.6 0.14 30)",
    "danish",
    "da",
  ),
  mk(
    "berlingske",
    "Berlingske",
    "https://www.berlingske.dk/content/rss",
    "oklch(0.55 0.16 270)",
    "danish",
    "da",
  ),
  mk("borsen", "Børsen", "https://borsen.dk/rss", "oklch(0.78 0.16 90)", "danish", "da"),
  mk(
    "finanswatch",
    "FinansWatch",
    "https://finanswatch.dk/?service=rssfeed",
    "oklch(0.68 0.14 200)",
    "danish",
    "da",
  ),

  // International
  mk(
    "bbc",
    "BBC",
    "http://feeds.bbci.co.uk/news/rss.xml",
    "oklch(0.62 0.22 15)",
    "international",
    "en",
  ),
  mk(
    "reuters",
    "Reuters",
    "https://feeds.reuters.com/reuters/topNews",
    "oklch(0.7 0.18 60)",
    "international",
    "en",
  ),
  mk(
    "nyt",
    "NYT",
    "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml",
    "oklch(0.85 0.005 250)",
    "international",
    "en",
  ),
  mk(
    "guardian",
    "Guardian",
    "https://www.theguardian.com/international/rss",
    "oklch(0.55 0.18 250)",
    "international",
    "en",
  ),

  // Tech
  mk("hn", "Hacker News", "https://hnrss.org/frontpage", "oklch(0.7 0.2 50)", "tech", "en"),
  mk(
    "verge",
    "The Verge",
    "https://www.theverge.com/rss/index.xml",
    "oklch(0.6 0.25 320)",
    "tech",
    "en",
  ),
];

export const DEFAULT_ENABLED = ["ilpost", "corriere", "drdk"];

export interface CustomSource {
  key: string; // "custom-<uuid>"
  label: string;
  rssUrl: string; // raw RSS, not wrapped
  color: string;
  lang?: string;
}

export function customToConfig(c: CustomSource): SourceConfig {
  return {
    key: c.key,
    label: c.label,
    rssUrl: c.rssUrl,
    feedUrl: rssApi(c.rssUrl),
    color: c.color,
    category: "custom",
    lang: c.lang,
    custom: true,
  };
}

export function buildCatalog(custom: CustomSource[]): SourceConfig[] {
  return [...SOURCE_CATALOG, ...custom.map(customToConfig)];
}

export function getSource(key: string, custom: CustomSource[] = []) {
  return buildCatalog(custom).find((s) => s.key === key);
}
