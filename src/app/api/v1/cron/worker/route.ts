import { NextRequest, NextResponse } from "next/server";
import { runWorkerTick } from "@/lib/ai/jobs/worker";
import { env } from "@/lib/env";

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
    const result = await runWorkerTick();
    return NextResponse.json({ data: result });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json(
      { error: error.message || "Failed to run worker tick" },
      { status: 500 }
    );
  }
}
