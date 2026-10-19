import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { Database } from "@/types/database";

let serviceRoleInstance: SupabaseClient<Database> | null = null;

/**
 * Creates or retrieves the Supabase Service Role client.
 *
 * Security Note:
 * This client bypasses Row Level Security.
 * It MUST only be used by background workers (cron/job worker) and administrative tasks.
 * It must NEVER be exposed or called in client components or untrusted contexts.
 */
export function createServiceRoleClient(): SupabaseClient<Database> {
  if (!serviceRoleInstance) {
    serviceRoleInstance = createClient<Database>(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );
  }
  return serviceRoleInstance;
}
