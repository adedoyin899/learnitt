/**
 * Search Configuration Defaults & Free Tier Quotas
 *
 * Prompt Requirement 1:
 * "SearchProvider interface with a mock and a real adapter for a search API that has a free tier.
 *  Choose the provider at build time. Check its current free limits first and record them in the
 *  README. Add a daily search cap in config."
 */

export const SEARCH_CONFIG = {
  // Provider selection (mock for tests and local dev, tavily or brave for live)
  DEFAULT_PROVIDER: (process.env.SEARCH_PROVIDER || "mock") as "mock" | "tavily" | "brave",

  // Daily search query call cap per user (to prevent runaway cost or hitting provider hard limits)
  DAILY_SEARCH_CALL_CAP: 50,

  // Maximum candidate URLs to fetch per search query
  MAX_RESULTS_PER_QUERY: 5,

  // Maximum search queries generated per skill that lacks materials
  MAX_QUERIES_PER_SKILL: 3,

  // Candidate classification batch size (PRD requirement: up to 10 candidates per batch)
  CLASSIFY_BATCH_SIZE: 10,

  // Vetting timeout for HTTP check in milliseconds
  VETTING_HTTP_TIMEOUT_MS: 5000,
} as const;
