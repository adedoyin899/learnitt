import { NextRequest, NextResponse } from "next/server";

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp in seconds
  retryAfterSeconds: number;
}

interface WindowRecord {
  count: number;
  resetAt: number; // timestamp in ms
}

class SlidingWindowRateLimiter {
  private windows: Map<string, WindowRecord> = new Map();
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number, windowSeconds: number = 60) {
    this.maxRequests = maxRequests;
    this.windowMs = windowSeconds * 1000;
  }

  public check(key: string): RateLimitResult {
    const now = Date.now();
    let record = this.windows.get(key);

    if (!record || now >= record.resetAt) {
      record = {
        count: 1,
        resetAt: now + this.windowMs,
      };
      this.windows.set(key, record);

      return {
        success: true,
        limit: this.maxRequests,
        remaining: this.maxRequests - 1,
        reset: Math.ceil(record.resetAt / 1000),
        retryAfterSeconds: 0,
      };
    }

    if (record.count >= this.maxRequests) {
      const retryAfter = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
      return {
        success: false,
        limit: this.maxRequests,
        remaining: 0,
        reset: Math.ceil(record.resetAt / 1000),
        retryAfterSeconds: retryAfter,
      };
    }

    record.count += 1;
    return {
      success: true,
      limit: this.maxRequests,
      remaining: this.maxRequests - record.count,
      reset: Math.ceil(record.resetAt / 1000),
      retryAfterSeconds: 0,
    };
  }

  public reset(key?: string): void {
    if (key) {
      this.windows.delete(key);
    } else {
      this.windows.clear();
    }
  }
}

// 20 requests per minute per user on AI routes
export const AI_RATE_LIMIT = 20;
// 10 requests per minute per IP on auth routes
export const AUTH_RATE_LIMIT = 10;

export const aiUserLimiter = new SlidingWindowRateLimiter(AI_RATE_LIMIT, 60);
export const authIpLimiter = new SlidingWindowRateLimiter(AUTH_RATE_LIMIT, 60);

export function resetAllRateLimits(): void {
  aiUserLimiter.reset();
  authIpLimiter.reset();
}

export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }
  return "127.0.0.1";
}

export function checkAiRateLimit(userId: string): RateLimitResult {
  return aiUserLimiter.check(userId);
}

export function checkAuthRateLimit(req: NextRequest): RateLimitResult {
  const ip = getClientIp(req);
  return authIpLimiter.check(ip);
}

export function rateLimitExceededResponse(
  result: RateLimitResult,
  customMessage?: string
): NextResponse {
  const message =
    customMessage ||
    `Rate limit exceeded. Maximum ${result.limit} requests per minute. Try again in ${result.retryAfterSeconds}s.`;

  return NextResponse.json(
    {
      error: message,
      retry_after: result.retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(result.reset),
        "Retry-After": String(result.retryAfterSeconds),
      },
    }
  );
}

export function attachRateLimitHeaders(
  response: NextResponse,
  result: RateLimitResult
): NextResponse {
  response.headers.set("X-RateLimit-Limit", String(result.limit));
  response.headers.set("X-RateLimit-Remaining", String(result.remaining));
  response.headers.set("X-RateLimit-Reset", String(result.reset));
  return response;
}
