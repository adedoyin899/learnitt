import * as net from "net";

export interface SSRFCheckResult {
  valid: boolean;
  error?: string;
  url?: URL;
}

/**
 * Checks if an IPv4 address falls within private, loopback, or cloud metadata ranges.
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // Treat malformed IPs as unsafe
  }

  const [a, b] = parts;

  // 0.0.0.0/8 (Broadcast/Current network)
  if (a === 0) return true;

  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;

  // 10.0.0.0/8 (Private RFC 1918)
  if (a === 10) return true;

  // 172.16.0.0/12 (Private RFC 1918)
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.168.0.0/16 (Private RFC 1918)
  if (a === 192 && b === 168) return true;

  // 169.254.0.0/16 (Link-local / Cloud Instance Metadata)
  if (a === 169 && b === 254) return true;

  // 100.64.0.0/10 (Carrier-Grade NAT)
  if (a === 100 && b >= 64 && b <= 127) return true;

  return false;
}

/**
 * Checks if an IPv6 address falls within private, loopback, or link-local ranges.
 */
function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1" || normalized === "::" || normalized.startsWith("fe80:") || normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true;
  }
  // IPv4-mapped IPv6 (::ffff:192.168.1.1)
  if (normalized.startsWith("::ffff:")) {
    const v4 = normalized.replace("::ffff:", "");
    if (net.isIPv4(v4)) {
      return isPrivateIPv4(v4);
    }
  }
  return false;
}

/**
 * Validates a target URL against SSRF vulnerabilities before fetching.
 * PRD Epic B1 & Prompt Requirement 2:
 * "URLs: fetch the page and extract readable text, with a size limit and a block on private IP ranges (SSRF protection)."
 */
export function validateUrlForSSRF(urlString: string): SSRFCheckResult {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return { valid: false, error: "Invalid URL format." };
  }

  // Scheme must be http or https
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      valid: false,
      error: `Unsupported protocol '${parsed.protocol}'. Only http and https URLs are allowed.`,
    };
  }

  const hostname = parsed.hostname.toLowerCase();
  const rawHost = hostname.replace(/^\[|\]$/g, "");

  // Known dangerous hostnames
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname === "metadata.google.internal" ||
    rawHost === "169.254.169.254" ||
    rawHost === "::1"
  ) {
    return {
      valid: false,
      error: `Blocked SSRF target: Hostname '${hostname}' is an internal/private address.`,
    };
  }

  // Check if hostname is directly an IP literal
  if (net.isIPv4(rawHost)) {
    if (isPrivateIPv4(rawHost)) {
      return {
        valid: false,
        error: `Blocked SSRF target: IP '${hostname}' is a private or loopback address.`,
      };
    }
  } else if (net.isIPv6(rawHost)) {
    if (isPrivateIPv6(rawHost)) {
      return {
        valid: false,
        error: `Blocked SSRF target: IPv6 '${hostname}' is a private or loopback address.`,
      };
    }
  }

  return { valid: true, url: parsed };
}
