import { validateUrlForSSRF } from "@/lib/materials/ssrf";
import { SEARCH_CONFIG } from "@/lib/config/search";

export interface VettingResult {
  url: string;
  normalizedUrl: string;
  isHealthy: boolean;
  statusCode?: number;
  error?: string;
  domain: string;
  title?: string;
}

/**
 * Normalizes a URL for deduplication and canonical matching:
 * - Lowercases scheme and hostname
 * - Strips URL fragment (#...)
 * - Strips common tracking and analytics query parameters
 * - Strips trailing slash on non-root paths
 */
export function normalizeUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== "string") {
    return "";
  }

  try {
    const parsed = new URL(rawUrl.trim());
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.hash = "";

    const trackingParams = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "ref",
      "source",
      "fbclid",
      "gclid",
      "mc_cid",
      "mc_eid",
    ];
    for (const param of trackingParams) {
      parsed.searchParams.delete(param);
    }

    if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }

    return parsed.toString();
  } catch {
    return rawUrl.trim();
  }
}

/**
 * Anti-Hallucination Invariant:
 * Enforces that every proposed resource URL originated directly from the search provider.
 * Any URL proposed by a model or external payload that was not returned by SearchProvider is rejected.
 */
export function assertSearchSourced(
  candidateUrl: string,
  searchProvidedUrls: Set<string>
): void {
  const normalizedCandidate = normalizeUrl(candidateUrl);
  if (!searchProvidedUrls.has(normalizedCandidate)) {
    throw new Error(
      `Resource rejected by anti-hallucination gate: URL '${candidateUrl}' was not returned by the search provider.`
    );
  }
}

export function isSearchSourced(
  candidateUrl: string,
  searchProvidedUrls: Set<string>
): boolean {
  const normalizedCandidate = normalizeUrl(candidateUrl);
  return searchProvidedUrls.has(normalizedCandidate);
}

/**
 * Vets a URL via SSRF validation and live HTTP check (200 or redirect to 200).
 * Drops dead links and records failures.
 */
export async function vetUrl(
  url: string,
  options?: {
    customFetch?: typeof fetch;
    timeoutMs?: number;
  }
): Promise<VettingResult> {
  const normalized = normalizeUrl(url);

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return {
      url,
      normalizedUrl: normalized,
      isHealthy: false,
      error: "Invalid URL syntax",
      domain: "",
    };
  }

  const domain = parsed.hostname;

  // 1. SSRF Check
  const ssrfCheck = validateUrlForSSRF(normalized);
  if (!ssrfCheck.valid) {
    return {
      url,
      normalizedUrl: normalized,
      isHealthy: false,
      error: ssrfCheck.error || "Blocked by SSRF protection",
      domain,
    };
  }

  // 2. HTTP Check (200 or redirect to 200)
  const fetchImpl = options?.customFetch || globalThis.fetch;
  const timeoutMs = options?.timeoutMs ?? SEARCH_CONFIG.VETTING_HTTP_TIMEOUT_MS;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      // First attempt with HEAD for efficiency
      res = await fetchImpl(normalized, {
        method: "HEAD",
        signal: controller.signal,
        headers: {
          "User-Agent": "Learnitt-Bot/1.0 (+https://learnitt.app)",
        },
      });

      // Some servers block HEAD or return 405 Method Not Allowed; fallback to GET
      if (res.status === 405 || res.status === 403) {
        res = await fetchImpl(normalized, {
          method: "GET",
          signal: controller.signal,
          headers: {
            "User-Agent": "Learnitt-Bot/1.0 (+https://learnitt.app)",
          },
        });
      }
    } finally {
      clearTimeout(timer);
    }

    const isHealthy = res.status >= 200 && res.status < 400;

    return {
      url,
      normalizedUrl: normalized,
      isHealthy,
      statusCode: res.status,
      error: isHealthy ? undefined : `HTTP error status ${res.status}`,
      domain,
    };
  } catch (err: any) {
    const errorMsg =
      err?.name === "AbortError"
        ? `Request timed out after ${timeoutMs}ms`
        : err?.message || "Network error";

    return {
      url,
      normalizedUrl: normalized,
      isHealthy: false,
      error: errorMsg,
      domain,
    };
  }
}
