import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { TodayClient } from "@/components/today/today-client";

export default async function TodayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const cookieStore = await cookies();
  const isLiveSupabase = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_URL.includes("supabase.co")
  );

  const isMockMode = process.env.MOCK_MODE === "true";
  const isMockAuth =
    !isLiveSupabase &&
    (cookieStore.has("sb-mock-auth") ||
      (isMockMode &&
        cookieStore.getAll().some((c) => c.name.includes("auth-token"))));

  const isUserAuthenticated = Boolean(user || isMockAuth);

  if (!isUserAuthenticated) {
    redirect("/login");
  }

  return (
    <div className="flex-1 w-full bg-background text-foreground flex flex-col selection:bg-primary/20">
      {/* Main Today Screen (S08 & S09) */}
      <main className="flex-1 w-full pb-16">
        <TodayClient />
      </main>
    </div>
  );
}
