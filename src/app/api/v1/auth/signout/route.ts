import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkAuthRateLimit, rateLimitExceededResponse } from "@/lib/security/rate-limit";

export async function POST(request: NextRequest) {
  const authLimit = checkAuthRateLimit(request);
  if (!authLimit.success) {
    return rateLimitExceededResponse(authLimit);
  }

  const supabase = await createClient();
  await supabase.auth.signOut();
  const { origin } = new URL(request.url);
  return NextResponse.redirect(`${origin}/login`, {
    status: 302,
  });
}
