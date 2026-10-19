import { z } from "zod";

const parseBoolean = (val: unknown, fallback: boolean): boolean => {
  if (val === undefined || val === null || val === "") return fallback;
  if (typeof val === "boolean") return val;
  if (typeof val === "string") {
    return val.toLowerCase() === "true" || val === "1";
  }
  return fallback;
};

export const getEnvSchema = (isMockMode: boolean) =>
  z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    MOCK_MODE: z
      .union([z.boolean(), z.string()])
      .optional()
      .transform((val) => parseBoolean(val, true)),
    NEXT_PUBLIC_SUPABASE_URL: z
      .string()
      .min(1, "NEXT_PUBLIC_SUPABASE_URL must be provided")
      .default(isMockMode ? "http://127.0.0.1:54321" : ""),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z
      .string()
      .min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY must be provided")
      .default(isMockMode ? "mock-anon-key-local-development" : ""),
    SUPABASE_SERVICE_ROLE_KEY: isMockMode
      ? z.string().default("mock-service-role-key-local-development")
      : z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required in production"),
    AI_PROVIDER_KEY: isMockMode
      ? z.string().optional().default("mock-ai-provider-key")
      : z.string().min(1, "AI_PROVIDER_KEY is required when MOCK_MODE is false"),
    AI_FALLBACK_PROVIDER_KEY: z.string().optional(),
    SEARCH_PROVIDER_KEY: isMockMode
      ? z.string().optional().default("mock-search-key")
      : z.string().min(1, "SEARCH_PROVIDER_KEY is required when MOCK_MODE is false"),
    EMAIL_PROVIDER_KEY: isMockMode
      ? z.string().optional().default("mock-email-key")
      : z.string().min(1, "EMAIL_PROVIDER_KEY is required when MOCK_MODE is false"),
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: isMockMode
      ? z.string().optional().default("mock-vapid-public-key")
      : z.string().min(1, "NEXT_PUBLIC_VAPID_PUBLIC_KEY is required when MOCK_MODE is false"),
    VAPID_PRIVATE_KEY: isMockMode
      ? z.string().optional().default("mock-vapid-private-key")
      : z.string().min(1, "VAPID_PRIVATE_KEY is required when MOCK_MODE is false"),
    VAPID_SUBJECT: isMockMode
      ? z.string().optional().default("mailto:mock@learnitt.local")
      : z.string().min(1, "VAPID_SUBJECT is required when MOCK_MODE is false"),
    CRON_SECRET: isMockMode
      ? z.string().optional().default("mock-cron-secret")
      : z.string().min(1, "CRON_SECRET is required when MOCK_MODE is false"),
  });

export function validateEnv(inputEnv: Record<string, string | undefined> = process.env) {
  const isMock = isMockModeExplicit(inputEnv);
  const schema = getEnvSchema(isMock);
  const parsed = schema.safeParse(inputEnv);

  if (!parsed.success) {
    const errorDetails = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Environment validation failed:\n${errorDetails}\n\nPlease check your .env or .env.local file.`
    );
  }

  return parsed.data;
}

function isMockModeExplicit(
  inputEnv: Record<string, string | undefined>
): boolean {
  if (inputEnv.MOCK_MODE !== undefined && inputEnv.MOCK_MODE !== "") {
    return parseBoolean(inputEnv.MOCK_MODE, true);
  }
  // By default, mock mode is enabled unless explicitly disabled (MOCK_MODE=false)
  return true;
}

export const env = validateEnv();
export type Env = z.infer<ReturnType<typeof getEnvSchema>>;
