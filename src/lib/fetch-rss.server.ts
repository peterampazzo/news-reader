const DESKTOP_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function isWellFormedJwt(token: string): boolean {
  const parts = token.split(".");
  return parts.length === 3 && parts.every((p) => p.length > 0);
}

function getAccessJwt(request: Request): string | null {
  return (
    request.headers.get("cf-access-jwt-assertion") ?? request.headers.get("Cf-Access-Jwt-Assertion")
  );
}

function assertAccessJwt(request: Request): Response | null {
  if (process.env.NODE_ENV !== "production") return null;

  const jwt = getAccessJwt(request);
  if (!jwt || !isWellFormedJwt(jwt)) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "0.0.0.0" || host.endsWith(".localhost")) {
    return true;
  }

  // IPv4 literals
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4) {
    const [, a, b] = ipv4.map(Number);
    if (a === 127) return true;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 0) return true;
  }

  // IPv6 loopback / link-local / unique-local
  if (
    host === "[::1]" ||
    host.startsWith("fe80:") ||
    host.startsWith("fc") ||
    host.startsWith("fd")
  ) {
    return true;
  }

  return false;
}

function parseTargetUrl(raw: string | null): URL | Response {
  if (!raw?.trim()) {
    return new Response("Missing url parameter", { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return new Response("Invalid url parameter", { status: 400 });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return new Response("Only http and https URLs are allowed", { status: 400 });
  }

  if (isBlockedHostname(parsed.hostname)) {
    return new Response("URL host is not allowed", { status: 400 });
  }

  return parsed;
}

export async function handleFetchRss(request: Request): Promise<Response> {
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const authError = assertAccessJwt(request);
  if (authError) return authError;

  const requestUrl = new URL(request.url);
  const target = parseTargetUrl(requestUrl.searchParams.get("url"));
  if (target instanceof Response) return target;

  try {
    const upstream = await fetch(target.toString(), {
      headers: { "User-Agent": DESKTOP_USER_AGENT },
      redirect: "follow",
    });

    if (upstream.status === 429 || upstream.status === 433) {
      return new Response(await upstream.text(), { status: upstream.status });
    }

    if (!upstream.ok) {
      return new Response(`Upstream HTTP ${upstream.status}`, { status: 502 });
    }

    const body = await upstream.text();
    return new Response(body, {
      status: 200,
      headers: { "content-type": "application/xml; charset=utf-8" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fetch failed";
    return new Response(message, { status: 502 });
  }
}
