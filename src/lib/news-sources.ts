export type SourceCategory = "italian" | "danish" | "international" | "tech" | "custom";

export interface SourceConfig {
  key: string;
  label: string;
  feedUrl: string;
  color: string; // oklch
  category: SourceCategory;
  lang?: string; // ISO 639-1 (used to decide if "translate" is offered)
  custom?: boolean;
}

export const rssApi = (rss: string) =>
  `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rss)}`;

export const CATEGORY_META: Record<SourceCategory, { label: string; emoji: string }> = {
  italian: { label: "Media Italiani", emoji: "🇮🇹" },
  danish: { label: "Media Danesi", emoji: "🇩🇰" },
  international: { label: "Internazionali", emoji: "🌍" },
  tech: { label: "Tech", emoji: "💻" },
  custom: { label: "I Miei Feed Personalizzati", emoji: "⭐" },
};

export const CATEGORY_ORDER: SourceCategory[] = ["danish", "italian", "international", "tech", "custom"];

export const SOURCE_CATALOG: SourceConfig[] = [
  { key: "ilpost", label: "Il Post", feedUrl: rssApi("https://www.ilpost.it/feed/"), color: "oklch(0.62 0.18 245)", category: "italian", lang: "it" },
  { key: "corriere", label: "Corriere", feedUrl: rssApi("https://xml2.corriereobjects.it/rss/homepage.xml"), color: "oklch(0.62 0.22 25)", category: "italian", lang: "it" },
  { key: "repubblica", label: "Repubblica", feedUrl: rssApi("https://www.repubblica.it/rss/homepage/rss2.0.xml"), color: "oklch(0.65 0.2 35)", category: "italian", lang: "it" },
  { key: "ansa", label: "ANSA", feedUrl: rssApi("https://www.ansa.it/sito/ansait_rss.xml"), color: "oklch(0.6 0.18 60)", category: "italian", lang: "it" },
  { key: "drdk", label: "DR.dk", feedUrl: rssApi("https://www.dr.dk/nyheder/service/feeds/allenyheder"), color: "oklch(0.7 0.02 250)", category: "danish", lang: "da" },
  { key: "politiken", label: "Politiken", feedUrl: rssApi("https://politiken.dk/rss/senestenyt.rss"), color: "oklch(0.6 0.14 30)", category: "danish", lang: "da" },
  { key: "bbc", label: "BBC", feedUrl: rssApi("http://feeds.bbci.co.uk/news/rss.xml"), color: "oklch(0.62 0.22 15)", category: "international", lang: "en" },
  { key: "reuters", label: "Reuters", feedUrl: rssApi("https://feeds.reuters.com/reuters/topNews"), color: "oklch(0.7 0.18 60)", category: "international", lang: "en" },
  { key: "nyt", label: "NYT", feedUrl: rssApi("https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml"), color: "oklch(0.85 0.005 250)", category: "international", lang: "en" },
  { key: "guardian", label: "Guardian", feedUrl: rssApi("https://www.theguardian.com/international/rss"), color: "oklch(0.55 0.18 250)", category: "international", lang: "en" },
  { key: "hn", label: "Hacker News", feedUrl: rssApi("https://hnrss.org/frontpage"), color: "oklch(0.7 0.2 50)", category: "tech", lang: "en" },
  { key: "verge", label: "The Verge", feedUrl: rssApi("https://www.theverge.com/rss/index.xml"), color: "oklch(0.6 0.25 320)", category: "tech", lang: "en" },
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
