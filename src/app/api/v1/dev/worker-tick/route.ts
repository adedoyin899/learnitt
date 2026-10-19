import { NextResponse } from "next/server";
import { runWorkerTick } from "@/lib/ai/jobs/worker";
import { env } from "@/lib/env";

export async function POST() {
  if (process.env.NODE_ENV === "production" && !env.MOCK_MODE) {
    return NextResponse.json(
      { error: "Dev worker route is disabled in production" },
      { status: 404 }
    );
  }

  try {
    const result = await runWorkerTick();
    return NextResponse.json({ data: result });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json(
      { error: error.message || "Failed to run dev worker tick" },
      { status: 500 }
    );
  }
}
