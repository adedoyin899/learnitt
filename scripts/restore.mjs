import fs from "fs";
import path from "path";

/**
 * Learnitt Database and Bucket Restoration Utility (Phase L12 Requirement 6)
 * Restores a backup bundle into a fresh local project or database.
 */

// Topological restoration order (parents before children)
export const RESTORE_ORDER = [
  "profiles",
  "goals",
  "skills",
  "skill_prereqs",
  "materials",
  "material_chunks",
  "skill_material_links",
  "resources",
  "resource_exclusions",
  "plan_items",
  "check_ins",
  "quizzes",
  "quiz_questions",
  "attempts",
  "grades",
  "conversations",
  "messages",
  "journal_entries",
  "skill_reviews",
  "goal_changes",
  "reminder_settings",
  "push_subscriptions",
  "reminder_log",
  "saved_cards",
  "usage_counters",
  "ai_jobs",
  "ai_cache",
  "audit_events",
];

export async function restoreBackup(backupFolder, client) {
  const manifestPath = path.join(backupFolder, "manifest.json");
  const dataPath = path.join(backupFolder, "database.json");

  if (!fs.existsSync(manifestPath) || !fs.existsSync(dataPath)) {
    throw new Error(`Invalid backup directory: missing manifest.json or database.json in ${backupFolder}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const tableData = JSON.parse(fs.readFileSync(dataPath, "utf8"));

  const restoreReport = {
    restored_at: new Date().toISOString(),
    restored_tables: {},
  };

  for (const table of RESTORE_ORDER) {
    const rows = tableData[table] || [];
    if (rows.length === 0) {
      restoreReport.restored_tables[table] = 0;
      continue;
    }

    if (typeof client.query === "function") {
      // Direct SQL insertion
      for (const row of rows) {
        const columns = Object.keys(row);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
        const values = columns.map((col) => {
          const val = row[col];
          // Handle arrays or json objects
          if (val !== null && typeof val === "object" && !Array.isArray(val)) {
            return JSON.stringify(val);
          }
          return val;
        });

        const sql = `
          INSERT INTO public.${table} (${columns.join(", ")})
          VALUES (${placeholders})
          ON CONFLICT DO NOTHING
        `;

        try {
          await client.query(sql, values);
        } catch (err) {
          console.warn(`Warning inserting row into ${table}:`, err?.message || err);
        }
      }
    } else if (typeof client.from === "function") {
      // Supabase JS client
      await client.from(table).upsert(rows);
    }

    restoreReport.restored_tables[table] = rows.length;
  }

  return restoreReport;
}
