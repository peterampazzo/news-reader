export interface SourceConfig {
  key: string;
  label: string;
  feedUrl: string;
  color: string; // oklch
}

const API = (rss: string) =>
  `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rss)}`;

export const SOURCE_CATALOG: SourceConfig[] = [
  { key: "ilpost", label: "Il Post", feedUrl: API("https://www.ilpost.it/feed/"), color: "oklch(0.62 0.18 245)" },
  { key: "corriere", label: "Corriere", feedUrl: API("https://xml2.corriereobjects.it/rss/homepage.xml"), color: "oklch(0.62 0.22 25)" },
  { key: "repubblica", label: "Repubblica", feedUrl: API("https://www.repubblica.it/rss/homepage/rss2.0.xml"), color: "oklch(0.65 0.2 35)" },
  { key: "ansa", label: "ANSA", feedUrl: API("https://www.ansa.it/sito/ansait_rss.xml"), color: "oklch(0.6 0.18 60)" },
  { key: "drdk", label: "DR.dk", feedUrl: API("https://www.dr.dk/nyheder/service/feeds/allenyheder"), color: "oklch(0.55 0.015 250)" },
  { key: "politiken", label: "Politiken", feedUrl: API("https://politiken.dk/rss/senestenyt.rss"), color: "oklch(0.6 0.14 30)" },
  { key: "bbc", label: "BBC", feedUrl: API("http://feeds.bbci.co.uk/news/rss.xml"), color: "oklch(0.62 0.22 15)" },
  { key: "reuters", label: "Reuters", feedUrl: API("https://feeds.reuters.com/reuters/topNews"), color: "oklch(0.7 0.18 60)" },
  { key: "nyt", label: "NYT", feedUrl: API("https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml"), color: "oklch(0.85 0.005 250)" },
  { key: "guardian", label: "Guardian", feedUrl: API("https://www.theguardian.com/international/rss"), color: "oklch(0.55 0.18 250)" },
  { key: "hn", label: "Hacker News", feedUrl: API("https://hnrss.org/frontpage"), color: "oklch(0.7 0.2 50)" },
  { key: "verge", label: "The Verge", feedUrl: API("https://www.theverge.com/rss/index.xml"), color: "oklch(0.6 0.25 320)" },
];

export const DEFAULT_ENABLED = ["ilpost", "corriere", "drdk"];

export function getSource(key: string) {
  return SOURCE_CATALOG.find((s) => s.key === key);
}
