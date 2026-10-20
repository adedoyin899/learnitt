import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { TodayClient } from "@/components/today/today-client";

export default async function TodayPage() {
  const cookieStore = await cookies();
  const hasAuthCookie = cookieStore
    .getAll()
    .some((c) => c.name.includes("auth-token") || c.name === "sb-mock-auth");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isMockMode = process.env.MOCK_MODE === "true";
  const isUserAuthenticated = user || (isMockMode && hasAuthCookie);

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
