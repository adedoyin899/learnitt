import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

export async function updateSession(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  let supabaseResponse = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: Array<{
            name: string;
            value: string;
            options?: Parameters<typeof supabaseResponse.cookies.set>[2];
          }>
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request: {
              headers: requestHeaders,
            },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data?.user ?? null;
  } catch {
    user = null;
  }

  const pathname = request.nextUrl.pathname;
  const method = request.method;

  const isAuthRoute =
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api/v1/auth");

  // Check auth rate limit per IP (Phase L12 Requirement 2)
  if (isAuthRoute && method === "POST") {
    const { checkAuthRateLimit, rateLimitExceededResponse } = await import(
      "@/lib/security/rate-limit"
    );
    const authLimit = checkAuthRateLimit(request);
    if (!authLimit.success) {
      return rateLimitExceededResponse(authLimit);
    }
  }

  // Check AI rate limit per user (Phase L12 Requirement 2)
  const isAiRoute =
    (pathname.endsWith("/plan/generate") ||
      pathname.endsWith("/plan/adapt") ||
      pathname.endsWith("/plan/reschedule") ||
      pathname.endsWith("/messages") ||
      pathname.endsWith("/explain") ||
      pathname.endsWith("/resources/discover") ||
      pathname.includes("/quizzes/generate")) &&
    method === "POST";

  if (isAiRoute && user) {
    const { checkAiRateLimit, rateLimitExceededResponse } = await import(
      "@/lib/security/rate-limit"
    );
    const aiLimit = checkAiRateLimit(user.id);
    if (!aiLimit.success) {
      return rateLimitExceededResponse(
        aiLimit,
        "AI rate limit exceeded. Maximum 20 AI requests per minute per user."
      );
    }
  }

  const isPublicAsset =
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/mock") ||
    pathname === "/favicon.ico" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js" ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".svg");

  const hasAuthCookie = request.cookies
    .getAll()
    .some((c) => c.name.includes("auth-token") || c.name === "sb-mock-auth");

  if (!user && !hasAuthCookie && !isAuthRoute && !isPublicAsset) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/today";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
