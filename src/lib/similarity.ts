// Lightweight token-based similarity to dedup near-duplicate headlines
// across networks (e.g. "Trump signs bill" vs "Trump signs new bill into law").

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "at", "for",
  "with", "is", "are", "was", "were", "be", "by", "as", "it", "this", "that",
  "from", "has", "have", "had", "will", "would", "after", "before", "into",
  "il", "lo", "la", "i", "gli", "le", "di", "a", "da", "in", "con", "su",
  "per", "tra", "fra", "che", "non", "del", "della", "dei", "delle",
  "og", "i", "på", "af", "til", "for", "med", "den", "det", "som", "en", "et",
]);

export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter((t) => t && t.length > 2 && !STOPWORDS.has(t));
}

export function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter++;
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function isNearDuplicate(titleA: string, titleB: string, threshold = 0.6): boolean {
  return jaccard(tokenize(titleA), tokenize(titleB)) >= threshold;
}
