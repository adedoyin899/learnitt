import fs from "fs";
import path from "path";

/**
 * Build-time check that fails if SUPABASE_SERVICE_ROLE_KEY or any private
 * provider secret appears in the client bundle (.next/static).
 */

const STATIC_DIR = path.join(process.cwd(), ".next", "static");

// Secret keys / values that must never leak into client JavaScript
const FORBIDDEN_PATTERNS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "CRON_SECRET",
  "VAPID_PRIVATE_KEY",
  "PLANTED_SECRET_SERVICE_ROLE_LEAK_TEST", // Test canary
];

// If env has actual secret values in build environment, add them to blacklist
if (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY.length > 5) {
  FORBIDDEN_PATTERNS.push(process.env.SUPABASE_SERVICE_ROLE_KEY);
}
if (process.env.CRON_SECRET && process.env.CRON_SECRET.length > 5) {
  FORBIDDEN_PATTERNS.push(process.env.CRON_SECRET);
}
if (process.env.AI_PROVIDER_KEY && process.env.AI_PROVIDER_KEY.length > 5 && process.env.AI_PROVIDER_KEY !== "mock-ai-provider-key") {
  FORBIDDEN_PATTERNS.push(process.env.AI_PROVIDER_KEY);
}
if (process.env.AI_API_KEY && process.env.AI_API_KEY.length > 5 && process.env.AI_API_KEY !== "mock-ai-api-key") {
  FORBIDDEN_PATTERNS.push(process.env.AI_API_KEY);
}
if (process.env.AI_FALLBACK_API_KEY && process.env.AI_FALLBACK_API_KEY.length > 5) {
  FORBIDDEN_PATTERNS.push(process.env.AI_FALLBACK_API_KEY);
}

export function scanDirectoryForSecrets(dirPath, patterns = FORBIDDEN_PATTERNS) {
  if (!fs.existsSync(dirPath)) {
    console.warn(`[check-bundle-secrets] Directory ${dirPath} does not exist. Skipping scan.`);
    return [];
  }

  const violations = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      violations.push(...scanDirectoryForSecrets(fullPath, patterns));
    } else if (entry.isFile() && (entry.name.endsWith(".js") || entry.name.endsWith(".mjs") || entry.name.endsWith(".html"))) {
      const content = fs.readFileSync(fullPath, "utf8");
      for (const pattern of patterns) {
        if (content.includes(pattern)) {
          violations.push({
            file: fullPath,
            pattern,
          });
        }
      }
    }
  }

  return violations;
}

export function runBundleSecretCheck() {
  console.log(`[check-bundle-secrets] Scanning ${STATIC_DIR} for forbidden secret leaks...`);
  const violations = scanDirectoryForSecrets(STATIC_DIR);

  if (violations.length > 0) {
    console.error("\n❌ CRITICAL SECURITY ERROR: Secret string(s) detected in client bundle!\n");
    violations.forEach((v) => {
      console.error(`  - Found "${v.pattern}" in ${v.file}`);
    });
    console.error("\nBuild aborted to prevent client bundle secret leakage.\n");
    process.exit(1);
  }

  console.log("✔ [check-bundle-secrets] Client bundle is clean. No secrets detected.");
}

// Execute when run as CLI
if (process.argv[1]?.endsWith("check-bundle-secrets.mjs")) {
  runBundleSecretCheck();
}
