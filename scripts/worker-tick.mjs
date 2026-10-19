#!/usr/bin/env node

/**
 * Learnitt Local Worker Tick Script
 * Triggers a single cron worker tick on the local or target server.
 */

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const CRON_SECRET = process.env.CRON_SECRET || "mock-cron-secret";

async function main() {
  console.log(`[worker-tick] Triggering worker tick against ${BASE_URL}...`);
  try {
    const res = await fetch(`${BASE_URL}/api/v1/cron/worker`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cron-secret": CRON_SECRET,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[worker-tick] Failed with status ${res.status}: ${text}`);
      process.exit(1);
    }

    const data = await res.json();
    console.log(`[worker-tick] Completed successfully:`, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`[worker-tick] Error connecting to server: ${err.message}`);
    console.log(`[worker-tick] Tip: Ensure the Next.js dev server is running ('pnpm run dev') or specify BASE_URL.`);
    process.exit(1);
  }
}

main();
