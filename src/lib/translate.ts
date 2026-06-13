// Lightweight translation helper using MyMemory (no API key required).
// Free tier: ~5,000 chars/day per IP. We cache results in memory + sessionStorage
// to avoid burning quota on repeat clicks.

const MEM_CACHE = new Map<string, string>();

function cacheKey(text: string, from: string, to: string) {
  return `tr:${from}>${to}:${text.slice(0, 200)}`;
}

function loadFromSession(key: string): string | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function saveToSession(key: string, value: string) {
  try {
    if (typeof window !== "undefined") window.sessionStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export async function translateText(text: string, from: string, to: string): Promise<string> {
  if (!text || !text.trim() || from === to) return text;
  const key = cacheKey(text, from, to);
  if (MEM_CACHE.has(key)) return MEM_CACHE.get(key)!;
  const sessionHit = loadFromSession(key);
  if (sessionHit) {
    MEM_CACHE.set(key, sessionHit);
    return sessionHit;
  }

  // MyMemory has a 500-char/segment limit — chunk on sentence boundaries.
  const chunks = chunkText(text, 480);
  const translated: string[] = [];
  for (const chunk of chunks) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=${from}|${to}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Translate HTTP ${res.status}`);
    const json = await res.json();
    const out = json?.responseData?.translatedText;
    if (typeof out !== "string") throw new Error("Translate: bad payload");
    translated.push(decodeEntities(out));
  }
  const result = translated.join(" ");
  MEM_CACHE.set(key, result);
  saveToSession(key, result);
  return result;
}

function chunkText(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const parts: string[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  let buf = "";
  for (const s of sentences) {
    if ((buf + " " + s).trim().length > max) {
      if (buf) parts.push(buf.trim());
      buf = s;
    } else {
      buf = buf ? `${buf} ${s}` : s;
    }
  }
  if (buf) parts.push(buf.trim());
  return parts;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
