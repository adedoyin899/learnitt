/**
 * AI Configuration Defaults
 *
 * Invariant: Model names MUST only exist in config and tests.
 * Business logic and adapter code must never hard-code model strings.
 */

export const AI_CONFIG = {
  DEFAULT_PROVIDER: "gemini" as const,
  // Free-tier default model
  DEFAULT_MODEL: "gemini-2.5-flash-lite",
  DEFAULT_FALLBACK_PROVIDER: undefined,
  DEFAULT_FALLBACK_MODEL: undefined,
  DAILY_AI_CALL_CAP: 300,
  DAILY_USER_AI_CALL_CAP: 150,
} as const;
