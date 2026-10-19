#!/usr/bin/env node
/**
 * scripts/create-pilot-goal.mjs
 * Creates the real 6-month Data Engineering pilot goal for the authenticated operator.
 * PRD Section 18 & Appendix A.
 *
 * Parameters:
 *   - 8 hours/week
 *   - 6 months (180 days)
 *   - Study Days: Monday to Friday (1, 2, 3, 4, 5)
 *   - Domain: Data Engineering
 *   - Starting Level: beginner
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  const userEmail = process.argv[2];
  if (!userEmail) {
    console.error("Usage: node scripts/create-pilot-goal.mjs <operator_email>");
    process.exit(1);
  }

  console.log(`Setting up real Data Engineering pilot goal for: ${userEmail}...`);

  // 1. Fetch user by email
  const { data: { users }, error: userErr } = await supabase.auth.admin.listUsers();
  if (userErr || !users) {
    console.error("Failed to list users:", userErr);
    process.exit(1);
  }

  const user = users.find((u) => u.email === userEmail);
  if (!user) {
    console.error(`User not found with email: ${userEmail}`);
    process.exit(1);
  }

  const userId = user.id;

  // 2. Check existing active goal
  const { data: existingGoals } = await supabase
    .from("goals")
    .select("id, title, status")
    .eq("owner_id", userId)
    .eq("status", "active");

  if (existingGoals && existingGoals.length > 0) {
    console.log(`Found active goal: "${existingGoals[0].title}" (${existingGoals[0].id})`);
    console.log("Pilot goal already exists. No fake data created.");
    return;
  }

  // 3. Create real pilot goal
  const targetDate = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const { data: goal, error: goalErr } = await supabase
    .from("goals")
    .insert({
      owner_id: userId,
      title: "Junior Data Engineer in 6 months",
      domain: "Data Engineering",
      starting_level: "beginner",
      target_date: targetDate,
      weekly_hours: 8.0,
      study_days: [1, 2, 3, 4, 5], // Monday to Friday
      status: "active",
      health_flag: false,
    })
    .select()
    .single();

  if (goalErr || !goal) {
    console.error("Failed to insert goal:", goalErr);
    process.exit(1);
  }

  console.log(`Created Goal: ${goal.title} (${goal.id})`);

  // 4. Insert 12 Data Engineering Skills
  const SKILLS = [
    {
      name: "SQL Fundamentals",
      description: "Core queries with SELECT, WHERE, and aggregations.",
      min_m: 60,
      max_m: 120,
      difficulty: 1,
      priority: 1,
      vtype: "recall",
      mvd_m: 15,
      mvd_task: "Run 3 queries filtering with WHERE.",
      pos: 1,
    },
    {
      name: "SQL Joins and Window Functions",
      description: "INNER, LEFT joins, and row_number/rank windows.",
      min_m: 90,
      max_m: 180,
      difficulty: 2,
      priority: 1,
      vtype: "applied",
      mvd_m: 15,
      mvd_task: "Write 1 multi-table join query.",
      pos: 2,
    },
    {
      name: "Python Fundamentals",
      description: "Variables, control flow, functions, and data structures.",
      min_m: 60,
      max_m: 120,
      difficulty: 1,
      priority: 1,
      vtype: "recall",
      mvd_m: 15,
      mvd_task: "Write 2 pure Python functions with tests.",
      pos: 3,
    },
    {
      name: "Python for Data & Pandas",
      description: "Tabular data transformation, cleaning, and filtering.",
      min_m: 90,
      max_m: 180,
      difficulty: 2,
      priority: 2,
      vtype: "applied",
      mvd_m: 15,
      mvd_task: "Clean one dirty CSV using Pandas.",
      pos: 4,
    },
    {
      name: "Relational Data Modelling",
      description: "Entity relationships, primary keys, and normal forms.",
      min_m: 90,
      max_m: 150,
      difficulty: 2,
      priority: 2,
      vtype: "applied",
      mvd_m: 15,
      mvd_task: "Sketch an ER diagram for 3 related tables.",
      pos: 5,
    },
    {
      name: "Dimensional Modelling & Star Schemas",
      description: "Facts, dimensions, surrogate keys, and slowly changing dimensions.",
      min_m: 120,
      max_m: 240,
      difficulty: 3,
      priority: 1,
      vtype: "applied",
      mvd_m: 20,
      mvd_task: "Design one fact and two dimension schemas.",
      pos: 6,
    },
    {
      name: "Batch ETL Pipeline Development",
      description: "Extracting source data, transforming, and loading into targets.",
      min_m: 120,
      max_m: 240,
      difficulty: 3,
      priority: 1,
      vtype: "artifact",
      mvd_m: 20,
      mvd_task: "Write a script loading data from API to DB.",
      pos: 7,
    },
    {
      name: "Pipeline Orchestration with Airflow",
      description: "Writing DAGs, tasks, operators, and managing schedules.",
      min_m: 120,
      max_m: 240,
      difficulty: 3,
      priority: 2,
      vtype: "artifact",
      mvd_m: 20,
      mvd_task: "Write a basic 3-task Airflow DAG.",
      pos: 8,
    },
    {
      name: "Cloud Object Storage & Data Lakes",
      description: "S3/GCS buckets, partitioning strategies, and parquet formats.",
      min_m: 90,
      max_m: 150,
      difficulty: 2,
      priority: 2,
      vtype: "recall",
      mvd_m: 15,
      mvd_task: "Explain partitioning by year/month/day.",
      pos: 9,
    },
    {
      name: "Cloud Data Warehousing",
      description: "Snowflake / BigQuery principles, clustering, and querying.",
      min_m: 120,
      max_m: 240,
      difficulty: 3,
      priority: 1,
      vtype: "applied",
      mvd_m: 20,
      mvd_task: "Query a partitioned public warehouse dataset.",
      pos: 10,
    },
    {
      name: "Data Quality & Automated Testing",
      description: "Schema validation, null checks, and Great Expectations/dbt tests.",
      min_m: 90,
      max_m: 180,
      difficulty: 2,
      priority: 2,
      vtype: "applied",
      mvd_m: 15,
      mvd_task: "Write 2 assertion tests for pipeline output.",
      pos: 11,
    },
    {
      name: "Capstone Data Engineering Project",
      description: "End-to-end automated pipeline from ingestion to warehouse.",
      min_m: 240,
      max_m: 480,
      difficulty: 4,
      priority: 1,
      vtype: "artifact",
      mvd_m: 30,
      mvd_task: "Document repo architecture and run test run.",
      pos: 12,
    },
  ];

  const skillInserts = SKILLS.map((s) => ({
    owner_id: userId,
    goal_id: goal.id,
    name: s.name,
    description: s.description,
    estimated_min_minutes: s.min_m,
    estimated_max_minutes: s.max_m,
    difficulty: s.difficulty,
    priority: s.priority,
    verification_type: s.vtype,
    mvd_minutes: s.mvd_m,
    mvd_task: s.mvd_task,
    status: s.pos === 1 ? "learning" : "not_started",
    evidence_level: 0,
    position: s.pos,
  }));

  const { data: insertedSkills, error: skillsErr } = await supabase
    .from("skills")
    .insert(skillInserts)
    .select();

  if (skillsErr || !insertedSkills) {
    console.error("Failed to insert skills:", skillsErr);
    process.exit(1);
  }

  console.log(`Inserted ${insertedSkills.length} skills in sequence.`);

  // 5. Connect Prerequisites
  const skillMap = new Map(insertedSkills.map((s) => [s.position, s.id]));
  const prereqPairs = [
    [2, 1], // sql_adv needs sql_basics
    [4, 3], // py_data needs py_basics
    [5, 1], // modelling needs sql_basics
    [6, 5], // star_schema needs modelling
    [7, 2], // batch needs sql_adv
    [7, 4], // batch needs py_data
    [8, 7], // airflow needs batch
    [9, 7], // cloud_lake needs batch
    [10, 6], // warehouse needs star_schema
    [10, 9], // warehouse needs cloud_lake
    [11, 7], // testing needs batch
    [12, 8], // capstone needs airflow
    [12, 10], // capstone needs warehouse
    [12, 11], // capstone needs testing
  ];

  const prereqRows = prereqPairs.map(([skillPos, prereqPos]) => ({
    owner_id: userId,
    skill_id: skillMap.get(skillPos),
    prereq_id: skillMap.get(prereqPos),
  }));

  await supabase.from("skill_prereqs").insert(prereqRows);
  console.log(`Linked ${prereqRows.length} prerequisite edges in the DAG.`);

  console.log("\n✔ Real pilot goal initialization complete!");
  console.log(`Goal: "${goal.title}"`);
  console.log("Ready for 6 months of real use (8h/week, Mon-Fri).");
}

main().catch((err) => {
  console.error("Error creating pilot goal:", err);
  process.exit(1);
});
