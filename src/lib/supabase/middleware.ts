import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
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
            request,
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

  const isApiRoute = pathname.startsWith("/api");

  const isLiveSupabase = Boolean(
    env.NEXT_PUBLIC_SUPABASE_URL &&
    env.NEXT_PUBLIC_SUPABASE_URL.includes("supabase.co")
  );

  const isMockMode = process.env.MOCK_MODE === "true" || env.MOCK_MODE;
  const isMockAuth =
    !isLiveSupabase &&
    (request.cookies.has("sb-mock-auth") ||
      (isMockMode &&
        request.cookies.getAll().some((c) => c.name.includes("auth-token"))));

  const isUserAuthenticated = Boolean(user || isMockAuth);

  const redirectWithCookies = (targetUrl: URL) => {
    const redirectRes = NextResponse.redirect(targetUrl);
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectRes.cookies.set(cookie.name, cookie.value, cookie);
    });
    return redirectRes;
  };

  if (!isUserAuthenticated && !isAuthRoute && !isPublicAsset && !isApiRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return redirectWithCookies(url);
  }

  if (isUserAuthenticated && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/today";
    return redirectWithCookies(url);
  }

  return supabaseResponse;
}
