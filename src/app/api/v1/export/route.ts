import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { createClient } from "@/lib/supabase/server";
import { downloadMaterialBuffer } from "@/lib/materials/storage";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1. Fetch all user-owned rows across every table (Epic I & Requirement 1)
    const [
      { data: profile },
      { data: goals },
      { data: skills },
      { data: skillPrereqs },
      { data: materials },
      { data: materialChunks },
      { data: skillMaterialLinks },
      { data: resources },
      { data: resourceExclusions },
      { data: planItems },
      { data: checkIns },
      { data: quizzes },
      { data: quizQuestions },
      { data: attempts },
      { data: grades },
      { data: conversations },
      { data: messages },
      { data: journalEntries },
      { data: skillReviews },
      { data: goalChanges },
      { data: reminderSettings },
      { data: pushSubscriptions },
      { data: reminderLogs },
      { data: savedCards },
      { data: usageCounters },
    ] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("goals").select("*").eq("owner_id", user.id),
      supabase.from("skills").select("*").eq("owner_id", user.id),
      supabase.from("skill_prereqs").select("*").eq("owner_id", user.id),
      supabase.from("materials").select("*").eq("owner_id", user.id),
      supabase
        .from("material_chunks")
        .select("id, material_id, ordinal, content, tokens")
        .eq("owner_id", user.id),
      supabase.from("skill_material_links").select("*").eq("owner_id", user.id),
      supabase.from("resources").select("*").eq("owner_id", user.id),
      supabase.from("resource_exclusions").select("*").eq("owner_id", user.id),
      supabase.from("plan_items").select("*").eq("owner_id", user.id),
      supabase.from("check_ins").select("*").eq("owner_id", user.id),
      supabase.from("quizzes").select("*").eq("owner_id", user.id),
      supabase.from("quiz_questions").select("*").eq("owner_id", user.id),
      supabase.from("attempts").select("*").eq("owner_id", user.id),
      supabase.from("grades").select("*").eq("owner_id", user.id),
      supabase.from("conversations").select("*").eq("owner_id", user.id),
      supabase.from("messages").select("*").eq("owner_id", user.id),
      supabase.from("journal_entries").select("*").eq("owner_id", user.id),
      supabase.from("skill_reviews").select("*").eq("owner_id", user.id),
      supabase.from("goal_changes").select("*").eq("owner_id", user.id),
      supabase.from("reminder_settings").select("*").eq("owner_id", user.id).maybeSingle(),
      supabase
        .from("push_subscriptions")
        .select("id, endpoint, created_at")
        .eq("owner_id", user.id),
      supabase.from("reminder_log").select("*").eq("owner_id", user.id),
      supabase.from("saved_cards").select("*").eq("owner_id", user.id),
      supabase.from("usage_counters").select("*").eq("owner_id", user.id),
    ]);

    const exportPayload = {
      version: "1.0",
      app: "Learnitt",
      exported_at: new Date().toISOString(),
      user_id: user.id,
      data: {
        profile: profile ?? null,
        goals: goals ?? [],
        skills: skills ?? [],
        skill_prereqs: skillPrereqs ?? [],
        materials: materials ?? [],
        material_chunks: materialChunks ?? [],
        skill_material_links: skillMaterialLinks ?? [],
        resources: resources ?? [],
        resource_exclusions: resourceExclusions ?? [],
        plan_items: planItems ?? [],
        check_ins: checkIns ?? [],
        quizzes: quizzes ?? [],
        quiz_questions: quizQuestions ?? [],
        attempts: attempts ?? [],
        grades: grades ?? [],
        conversations: conversations ?? [],
        messages: messages ?? [],
        journal_entries: journalEntries ?? [],
        skill_reviews: skillReviews ?? [],
        goal_changes: goalChanges ?? [],
        reminder_settings: reminderSettings ?? null,
        push_subscriptions: pushSubscriptions ?? [],
        reminder_log: reminderLogs ?? [],
        saved_cards: savedCards ?? [],
        usage_counters: usageCounters ?? [],
      },
    };

    // If client requested pure JSON format (e.g. for API inspection or test validation)
    const url = new URL(req.url);
    const format = url.searchParams.get("format");
    const acceptHeader = req.headers.get("accept");

    if (format === "json" || (acceptHeader && acceptHeader.includes("application/json") && !acceptHeader.includes("application/zip"))) {
      return NextResponse.json(exportPayload);
    }

    // 2. Build ZIP containing JSON dump + original materials files
    const zip = new JSZip();

    // Add JSON file
    zip.file("learnitt-data.json", JSON.stringify(exportPayload, null, 2));

    // Add original materials to materials/ folder
    const materialsFolder = zip.folder("materials");
    if (materials && materials.length > 0 && materialsFolder) {
      for (const mat of materials) {
        if (mat.storage_path) {
          try {
            const buffer = await downloadMaterialBuffer(mat.storage_path, supabase);
            const sanitizedTitle = (mat.title || "material")
              .replace(/[/\\?%*:|"<>]/g, "_")
              .slice(0, 50);
            const ext = mat.kind === "pdf" ? ".pdf" : mat.kind === "markdown" ? ".md" : ".txt";
            materialsFolder.file(`${sanitizedTitle}_${mat.id}${ext}`, buffer);
          } catch (downloadErr) {
            console.warn(`Could not include file for material ${mat.id} in zip:`, downloadErr);
          }
        }
      }
    }

    const zipBuffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    const filename = `learnitt-export-${new Date().toISOString().split("T")[0]}.zip`;

    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json(
      { error: error.message || "Failed to generate export archive" },
      { status: 500 }
    );
  }
}
