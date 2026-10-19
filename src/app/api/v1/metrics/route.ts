import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculatePilotMetrics, generateMonthlyReviewMarkdown } from "@/lib/metrics/service";

/**
 * GET /api/v1/metrics
 * Returns PRD Section 18 pilot metrics for the authenticated operator.
 * Query parameters:
 *   - format: 'json' (default) or 'markdown' (for monthly review export)
 *   - start_date: ISO date string
 *   - end_date: ISO date string
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") || "json";
  const startDate = searchParams.get("start_date") || undefined;
  const endDate = searchParams.get("end_date") || undefined;

  try {
    const metrics = await calculatePilotMetrics(supabase, user.id, {
      startDate,
      endDate,
    });

    if (format === "markdown") {
      const monthStr = searchParams.get("month") || undefined;
      const markdown = generateMonthlyReviewMarkdown(metrics, monthStr);
      return new NextResponse(markdown, {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="learnitt-monthly-review-${new Date().toISOString().slice(0, 7)}.md"`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      metrics,
    });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json(
      { error: error.message || "Failed to calculate pilot metrics" },
      { status: 500 }
    );
  }
}
