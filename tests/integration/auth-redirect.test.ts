/**
 * @vitest-environment node
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Mock @supabase/ssr createServerClient
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn((_url, _key, options) => {
    // Check if a mock user is simulated in cookie
    const cookies = options.cookies.getAll();
    const hasAuthCookie = cookies.some((c: { name: string; value: string }) =>
      c.name.includes("auth-token")
    );

    return {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: hasAuthCookie
              ? { id: "test-user-id", email: "user@learnitt.com" }
              : null,
          },
          error: null,
        }),
      },
    };
  }),
}));

describe("Auth Route Protection (src/middleware.ts & src/lib/supabase/middleware.ts)", () => {
  it("redirects unauthenticated user accessing /today to /login", async () => {
    const request = new NextRequest("http://localhost:3000/today");
    const response = await updateSession(request);

    expect(response.status).toBe(307); // NextResponse.redirect default
    const location = response.headers.get("location");
    expect(location).toContain("/login");
  });

  it("redirects unauthenticated user accessing root / to /login", async () => {
    const request = new NextRequest("http://localhost:3000/");
    const response = await updateSession(request);

    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toContain("/login");
  });

  it("allows unauthenticated user to access /login directly", async () => {
    const request = new NextRequest("http://localhost:3000/login");
    const response = await updateSession(request);

    // No redirect away from /login
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects authenticated user accessing /login to /today", async () => {
    const request = new NextRequest("http://localhost:3000/login", {
      headers: {
        cookie: "sb-auth-token=active-session-token",
      },
    });
    const response = await updateSession(request);

    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toContain("/today");
  });

  it("allows public PWA assets without redirecting", async () => {
    const manifestReq = new NextRequest("http://localhost:3000/manifest.webmanifest");
    const manifestRes = await updateSession(manifestReq);
    expect(manifestRes.headers.get("location")).toBeNull();

    const swReq = new NextRequest("http://localhost:3000/sw.js");
    const swRes = await updateSession(swReq);
    expect(swRes.headers.get("location")).toBeNull();
  });
});
