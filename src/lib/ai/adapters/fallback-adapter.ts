import { AIProvider, AIStructuredArgs, AIStructuredResponse } from "../types";

export interface FallbackProviderOptions {
  primary: AIProvider;
  fallback?: AIProvider | null;
}

export function isRetryableAIError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const anyErr = error as { status?: number; isRateLimit?: boolean; isRetryable?: boolean; message?: string };
  if (anyErr.isRateLimit === true || anyErr.isRetryable === true) return true;
  if (
    anyErr.status === 429 ||
    anyErr.status === 500 ||
    anyErr.status === 502 ||
    anyErr.status === 503 ||
    anyErr.status === 504
  ) {
    return true;
  }
  const msg = (anyErr.message || "").toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("503") ||
    msg.includes("502") ||
    msg.includes("500") ||
    msg.includes("rate limit") ||
    msg.includes("quota exceeded") ||
    msg.includes("server error") ||
    msg.includes("temporary error") ||
    msg.includes("unavailable") ||
    msg.includes("high demand") ||
    msg.includes("overloaded")
  );
}

export class FallbackAIProvider implements AIProvider {
  readonly id: string;
  readonly primary: AIProvider;
  readonly fallback: AIProvider | null;

  constructor(options: FallbackProviderOptions) {
    this.primary = options.primary;
    this.fallback = options.fallback || null;
    this.id = this.fallback
      ? `${this.primary.id}-with-fallback-${this.fallback.id}`
      : this.primary.id;
  }

  async generateStructured<T>(args: AIStructuredArgs): Promise<AIStructuredResponse<T>> {
    try {
      return await this.primary.generateStructured<T>(args);
    } catch (primaryError) {
      if (!isRetryableAIError(primaryError)) {
        if (this.fallback && this.fallback.id === "mock-fallback") {
          return await this.fallback.generateStructured<T>(args);
        }
        throw primaryError;
      }

      // Retry primary once on rate-limit / server error
      try {
        return await this.primary.generateStructured<T>(args);
      } catch (retryError) {
        if (this.fallback && (isRetryableAIError(retryError) || this.fallback.id === "mock-fallback")) {
          // Send to fallback provider if configured
          return await this.fallback.generateStructured<T>(args);
        }
        throw retryError;
      }
    }
  }
}
