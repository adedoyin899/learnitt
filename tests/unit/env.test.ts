import { describe, it, expect } from "vitest";
import { validateEnv, getEnvSchema } from "@/lib/env";

describe("Environment Validation (src/lib/env.ts)", () => {
  it("boots in mock mode by default with zero keys required", () => {
    const mockEnv = {
      NODE_ENV: "development",
      MOCK_MODE: "true",
    };

    const parsed = validateEnv(mockEnv);
    expect(parsed.MOCK_MODE).toBe(true);
    expect(parsed.NEXT_PUBLIC_SUPABASE_URL).toBeDefined();
    expect(parsed.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBeDefined();
    expect(parsed.AI_PROVIDER_KEY).toBe("mock-ai-provider-key");
  });

  it("fails with a clear error message when required production variables are missing", () => {
    const prodEnvMissingSecrets = {
      NODE_ENV: "production",
      MOCK_MODE: "false",
      NEXT_PUBLIC_SUPABASE_URL: "https://my-project.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "ey...anon-key",
      // Missing: SUPABASE_SERVICE_ROLE_KEY, AI_PROVIDER_KEY, SEARCH_PROVIDER_KEY, etc.
    };

    expect(() => validateEnv(prodEnvMissingSecrets)).toThrowError(
      /Environment validation failed/
    );

    try {
      validateEnv(prodEnvMissingSecrets);
    } catch (err: unknown) {
      const errorMsg = (err as Error).message;
      expect(errorMsg).toContain("SUPABASE_SERVICE_ROLE_KEY");
      expect(errorMsg).toContain("AI_PROVIDER_KEY");
      expect(errorMsg).toContain("SEARCH_PROVIDER_KEY");
    }
  });

  it("fails when NEXT_PUBLIC_SUPABASE_URL is empty in strict mode", () => {
    const schema = getEnvSchema(false);
    const result = schema.safeParse({
      NODE_ENV: "production",
      MOCK_MODE: "false",
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "key",
      SUPABASE_SERVICE_ROLE_KEY: "role-key",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path.includes("NEXT_PUBLIC_SUPABASE_URL"))
      ).toBe(true);
    }
  });
});
