import { NextRequest, NextResponse } from "next/server";
import { processDueReminders } from "@/lib/reminders/service";
import { env } from "@/lib/env";

/**
 * POST /api/v1/cron/reminders
 * Evaluates all users due for reminders right now.
 * Protected by CRON_SECRET header (PRD Section 11 & Requirement 2).
 * Returns 401 if missing or wrong secret.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecretHeader = req.headers.get("x-cron-secret");

  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.substring(7)
    : null;

  const providedSecret = cronSecretHeader || bearerToken;

  if (!providedSecret || providedSecret !== env.CRON_SECRET) {
    return NextResponse.json(
      { error: "Unauthorized: Invalid or missing CRON_SECRET" },
      { status: 401 }
    );
  }

  try {
    const result = await processDueReminders();
    return NextResponse.json({
      data: result,
      message: `Reminders processed: ${result.sentCount} sent, ${result.skippedDayCompleteCount} skipped (completed), ${result.skippedAlreadySentCount} skipped (deduped).`,
    });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json(
      { error: error.message || "Failed to process reminders" },
      { status: 500 }
    );
  }
}
