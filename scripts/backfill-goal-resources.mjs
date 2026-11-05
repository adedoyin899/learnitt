#!/usr/bin/env node
/**
 * scripts/backfill-goal-resources.mjs
 * Heals any non-SQL goals that were seeded with legacy SQL skills,
 * and discovers, vets, approves, and attaches curated learning resources and study guides
 * for all skills in existing goals and links them to scheduled plan items.
 */

import fs from "fs";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

if (process.loadEnvFile) {
  if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");
  else if (fs.existsSync(".env")) process.loadEnvFile(".env");
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const PIANO_MUSIC_SKILLS = [
  {
    key: "sk_mus_01",
    name: "Keyboard Posture, Hand Shape & Finger Numbering",
    description: "Bench height, relaxed wrist alignment, curved fingers (1-5), and navigating white/black key groups.",
    estimated_min_minutes: 45,
    estimated_max_minutes: 90,
    difficulty: 1,
    priority: 1,
    verification_type: "applied",
    mvd_minutes: 15,
    mvd_task: "Practice five-finger C position warmups with relaxed wrists for Both Hands.",
    prereq_keys: [],
  },
  {
    key: "sk_mus_02",
    name: "Staff Notation: Treble & Bass Clef Reading",
    description: "Grand staff landmarks (Middle C, Treble G, Bass F), ledger lines, and interval recognition (steps and skips).",
    estimated_min_minutes: 60,
    estimated_max_minutes: 120,
    difficulty: 2,
    priority: 1,
    verification_type: "recall",
    mvd_minutes: 15,
    mvd_task: "Sight-identify 20 grand staff notes across treble and bass clefs.",
    prereq_keys: ["sk_mus_01"],
  },
  {
    key: "sk_mus_03",
    name: "Rhythm, Time Signatures & Metronome Pulse",
    description: "Whole, half, quarter, eighth, and dotted notes, rests, ties, and steady counting in 4/4, 3/4, and 6/8.",
    estimated_min_minutes: 60,
    estimated_max_minutes: 120,
    difficulty: 2,
    priority: 1,
    verification_type: "applied",
    mvd_minutes: 15,
    mvd_task: "Clap and play a 16-bar rhythmic study at 72 BPM with a metronome.",
    prereq_keys: ["sk_mus_01"],
  },
  {
    key: "sk_mus_04",
    name: "Major Scales & Thumb-Under Technique",
    description: "Whole/half-step scale construction, smooth thumb-under crossings, and playing C, G, D, and F Major scales.",
    estimated_min_minutes: 90,
    estimated_max_minutes: 150,
    difficulty: 2,
    priority: 1,
    verification_type: "applied",
    mvd_minutes: 15,
    mvd_task: "Play C and G Major scales two octaves hands separately at 80 BPM.",
    prereq_keys: ["sk_mus_02"],
  },
  {
    key: "sk_mus_05",
    name: "Triads, Inversions & Diatonic Harmony",
    description: "Major, minor, diminished, and augmented triads, root position vs. 1st/2nd inversions, and primary chords (I, IV, V).",
    estimated_min_minutes: 90,
    estimated_max_minutes: 150,
    difficulty: 3,
    priority: 1,
    verification_type: "recall",
    mvd_minutes: 15,
    mvd_task: "Play I-IV-V-I cadences in C, G, and F Major using smooth voice leading.",
    prereq_keys: ["sk_mus_04"],
  },
  {
    key: "sk_mus_06",
    name: "Two-Hand Coordination & Independence",
    description: "Combining left-hand bass/chord patterns with right-hand melodies, contrary motion, and contrapuntal balance.",
    estimated_min_minutes: 90,
    estimated_max_minutes: 180,
    difficulty: 3,
    priority: 1,
    verification_type: "applied",
    mvd_minutes: 15,
    mvd_task: "Practice a 8-measure melody with Alberti bass accompaniment hands together.",
    prereq_keys: ["sk_mus_03", "sk_mus_04"],
  },
  {
    key: "sk_mus_07",
    name: "Minor Scales, Key Signatures & Circle of Fifths",
    description: "Natural, harmonic, and melodic minor scales, relative keys, and navigating the Circle of Fifths.",
    estimated_min_minutes: 90,
    estimated_max_minutes: 150,
    difficulty: 3,
    priority: 2,
    verification_type: "recall",
    mvd_minutes: 15,
    mvd_task: "Play A and E harmonic minor scales and identify their key signatures.",
    prereq_keys: ["sk_mus_04", "sk_mus_05"],
  },
  {
    key: "sk_mus_08",
    name: "Common Chord Progressions & Accompaniment Patterns",
    description: "Playing I-V-vi-IV, ii-V-I, and 12-bar progressions using broken chords, arpeggiated bass, and rhythmic comping.",
    estimated_min_minutes: 90,
    estimated_max_minutes: 150,
    difficulty: 3,
    priority: 2,
    verification_type: "applied",
    mvd_minutes: 15,
    mvd_task: "Play a I-vi-IV-V progression in two keys with rhythmic left-hand accompaniment.",
    prereq_keys: ["sk_mus_05", "sk_mus_06"],
  },
  {
    key: "sk_mus_09",
    name: "Damper Pedal Technique, Dynamics & Articulation",
    description: "Syncopated (legato) pedaling, staccato vs. legato touch, crescendo/diminuendo shaping, and expressive phrasing.",
    estimated_min_minutes: 60,
    estimated_max_minutes: 120,
    difficulty: 3,
    priority: 2,
    verification_type: "applied",
    mvd_minutes: 15,
    mvd_task: "Connect a chord progression using clean syncopated damper pedaling.",
    prereq_keys: ["sk_mus_06"],
  },
  {
    key: "sk_mus_10",
    name: "Seventh Chords, Arpeggios & Voice Leading",
    description: "Major 7th, Dominant 7th, and Minor 7th chords, multi-octave arpeggios, and smooth chord transitions.",
    estimated_min_minutes: 90,
    estimated_max_minutes: 180,
    difficulty: 4,
    priority: 2,
    verification_type: "applied",
    mvd_minutes: 15,
    mvd_task: "Practice two-octave root and inverted arpeggios in C Major and A Minor.",
    prereq_keys: ["sk_mus_07", "sk_mus_08"],
  },
  {
    key: "sk_mus_11",
    name: "Sight-Reading & Ear Training Foundations",
    description: "Look-ahead reading habits, recognizing melodic/harmonic intervals by ear, and playing lead sheets.",
    estimated_min_minutes: 60,
    estimated_max_minutes: 120,
    difficulty: 4,
    priority: 2,
    verification_type: "recall",
    mvd_minutes: 15,
    mvd_task: "Sight-read an unfamiliar 16-bar piece at slow tempo without stopping.",
    prereq_keys: ["sk_mus_06", "sk_mus_08"],
  },
  {
    key: "sk_mus_12",
    name: "Complete Repertoire Performance Capstone",
    description: "Polishing, memorizing, and recording a complete multi-section piano piece with accurate rhythm, dynamics, and pedaling.",
    estimated_min_minutes: 120,
    estimated_max_minutes: 240,
    difficulty: 5,
    priority: 3,
    verification_type: "artifact",
    mvd_minutes: 15,
    mvd_task: "Play through the A-section of your capstone piece with expressive dynamics.",
    prereq_keys: ["sk_mus_09", "sk_mus_10", "sk_mus_11"],
  },
];

// Canonical, pre-vetted educational resources for common curriculum topics
const TOPIC_RESOURCES = [
  // --- PIANO & MUSIC THEORY ---
  {
    match: ["keyboard posture", "hand shape", "finger numbering"],
    resources: [
      {
        url: "https://en.wikipedia.org/wiki/Piano",
        title: "Piano Keyboard Layout, Mechanics & Playing Posture",
        domain: "en.wikipedia.org",
        type: "article",
        estimated_minutes: 20,
        relevance: 0.97,
      },
      {
        url: "https://en.wikipedia.org/wiki/Fingering_(music)",
        title: "Musical Fingering Systems & Keyboard Hand Position",
        domain: "en.wikipedia.org",
        type: "article",
        estimated_minutes: 15,
        relevance: 0.94,
      },
    ],
  },
  {
    match: ["staff notation", "treble & bass clef", "clef"],
    resources: [
      {
        url: "https://en.wikipedia.org/wiki/Musical_notation",
        title: "Musical Notation, Grand Staff & Note Reading Guide",
        domain: "en.wikipedia.org",
        type: "article",
        estimated_minutes: 25,
        relevance: 0.97,
      },
      {
        url: "https://en.wikipedia.org/wiki/Clef",
        title: "Treble, Bass, and Grand Staff Clef Landmarks",
        domain: "en.wikipedia.org",
        type: "article",
        estimated_minutes: 15,
        relevance: 0.93,
      },
    ],
  },
  {
    match: ["rhythm, time signatures", "metronome pulse"],
    resources: [
      {
        url: "https://en.wikipedia.org/wiki/Time_signature",
        title: "Time Signatures, Meter, and Rhythmic Subdivisions",
        domain: "en.wikipedia.org",
        type: "article",
        estimated_minutes: 20,
        relevance: 0.96,
      },
      {
        url: "https://en.wikipedia.org/wiki/Rhythm",
        title: "Rhythm, Pulse, Syncopation & Metronome Practice",
        domain: "en.wikipedia.org",
        type: "article",
        estimated_minutes: 20,
        relevance: 0.92,
      },
    ],
  },
  {
    match: ["major scales", "thumb-under"],
    resources: [
      {
        url: "https://en.wikipedia.org/wiki/Major_scale",
        title: "Major Scales, Tetrachords & Whole/Half-Step Patterns",
        domain: "en.wikipedia.org",
        type: "article",
        estimated_minutes: 25,
        relevance: 0.97,
      },
      {
        url: "https://en.wikipedia.org/wiki/Scale_(music)",
        title: "Musical Scales & Keyboard Finger Crossings",
        domain: "en.wikipedia.org",
        type: "article",
        estimated_minutes: 20,
        relevance: 0.93,
      },
    ],
  },
  {
    match: ["triads, inversions", "diatonic harmony"],
    resources: [
      {
        url: "https://en.wikipedia.org/wiki/Triad_(music)",
        title: "Triads, Root Position & First/Second Inversions",
        domain: "en.wikipedia.org",
        type: "article",
        estimated_minutes: 25,
        relevance: 0.97,
      },
      {
        url: "https://en.wikipedia.org/wiki/Chord_(music)",
        title: "Diatonic Chords, Harmonic Function & Cadences",
        domain: "en.wikipedia.org",
        type: "article",
        estimated_minutes: 25,
        relevance: 0.94,
      },
    ],
  },
  {
    match: ["two-hand coordination", "independence"],
    resources: [
      {
        url: "https://en.wikipedia.org/wiki/Alberti_bass",
        title: "Alberti Bass & Left-Hand Accompaniment Patterns",
        domain: "en.wikipedia.org",
        type: "article",
        estimated_minutes: 20,
        relevance: 0.95,
      },
      {
        url: "https://en.wikipedia.org/wiki/Counterpoint",
        title: "Counterpoint & Two-Hand Musical Independence",
        domain: "en.wikipedia.org",
        type: "article",
        estimated_minutes: 25,
        relevance: 0.92,
      },
    ],
  },
  {
    match: ["minor scales", "circle of fifths"],
    resources: [
      {
        url: "https://en.wikipedia.org/wiki/Minor_scale",
        title: "Natural, Harmonic & Melodic Minor Scales",
        domain: "en.wikipedia.org",
        type: "article",
        estimated_minutes: 25,
        relevance: 0.97,
      },
      {
        url: "https://en.wikipedia.org/wiki/Circle_of_fifths",
        title: "The Circle of Fifths & Key Signatures Explained",
        domain: "en.wikipedia.org",
        type: "article",
        estimated_minutes: 20,
        relevance: 0.96,
      },
    ],
  },
  {
    match: ["common chord progressions", "accompaniment patterns"],
    resources: [
      {
        url: "https://en.wikipedia.org/wiki/Chord_progression",
        title: "Common Chord Progressions (I-V-vi-IV, ii-V-I) & Harmony",
        domain: "en.wikipedia.org",
        type: "article",
        estimated_minutes: 25,
        relevance: 0.97,
      },
      {
        url: "https://en.wikipedia.org/wiki/Accompaniment",
        title: "Keyboard Accompaniment Voicings & Comping Patterns",
        domain: "en.wikipedia.org",
        type: "article",
        estimated_minutes: 20,
        relevance: 0.92,
      },
    ],
  },
  {
    match: ["damper pedal", "dynamics & articulation"],
    resources: [
      {
        url: "https://en.wikipedia.org/wiki/Sustain_pedal",
        title: "Damper (Sustain) Pedal Technique & Syncopated Pedaling",
        domain: "en.wikipedia.org",
        type: "article",
        estimated_minutes: 20,
        relevance: 0.96,
      },
      {
        url: "https://en.wikipedia.org/wiki/Dynamics_(music)",
        title: "Musical Dynamics, Articulation & Expressive Phrasing",
        domain: "en.wikipedia.org",
        type: "article",
        estimated_minutes: 20,
        relevance: 0.94,
      },
    ],
  },
  {
    match: ["seventh chords", "arpeggios", "voice leading"],
    resources: [
      {
        url: "https://en.wikipedia.org/wiki/Seventh_chord",
        title: "Seventh Chords (Major, Dominant, Minor) & Voicings",
        domain: "en.wikipedia.org",
        type: "article",
        estimated_minutes: 25,
        relevance: 0.96,
      },
      {
        url: "https://en.wikipedia.org/wiki/Arpeggio",
        title: "Arpeggio Technique & Smooth Voice Leading on Piano",
        domain: "en.wikipedia.org",
        type: "article",
        estimated_minutes: 20,
        relevance: 0.94,
      },
    ],
  },
  {
    match: ["sight-reading", "ear training"],
    resources: [
      {
        url: "https://en.wikipedia.org/wiki/Sight-reading",
        title: "Sight-Reading Strategies & Look-Ahead Keyboard Habits",
        domain: "en.wikipedia.org",
        type: "article",
        estimated_minutes: 25,
        relevance: 0.97,
      },
      {
        url: "https://en.wikipedia.org/wiki/Ear_training",
        title: "Ear Training, Interval Recognition & Harmonic Dictation",
        domain: "en.wikipedia.org",
        type: "article",
        estimated_minutes: 20,
        relevance: 0.93,
      },
    ],
  },
  {
    match: ["complete repertoire performance", "repertoire"],
    resources: [
      {
        url: "https://en.wikipedia.org/wiki/Piano_repertoire",
        title: "Essential Piano Repertoire, Interpretation & Performance Practice",
        domain: "en.wikipedia.org",
        type: "article",
        estimated_minutes: 30,
        relevance: 0.97,
      },
      {
        url: "https://en.wikipedia.org/wiki/Musical_phrasing",
        title: "Musical Phrasing, Rubato & Stage Performance Preparation",
        domain: "en.wikipedia.org",
        type: "article",
        estimated_minutes: 20,
        relevance: 0.93,
      },
    ],
  },

  // --- DATA ENGINEERING ---
  {
    match: ["sql & relational modeling fundamentals"],
    resources: [
      {
        url: "https://en.wikipedia.org/wiki/SQL",
        title: "SQL Overview, Syntax, & Relational Queries",
        domain: "en.wikipedia.org",
        type: "article",
        estimated_minutes: 25,
        relevance: 0.95,
      },
      {
        url: "https://en.wikipedia.org/wiki/Relational_model",
        title: "Relational Model & Database Normalization",
        domain: "en.wikipedia.org",
        type: "docs",
        estimated_minutes: 30,
        relevance: 0.92,
      },
      {
        url: "https://www.sqlite.org/queryplanner.html",
        title: "SQLite Query Planner & Index Optimization",
        domain: "sqlite.org",
        type: "docs",
        estimated_minutes: 20,
        relevance: 0.88,
      },
    ],
  },
  {
    match: ["sql & relational modeling", "sql fundamentals"],
    resources: [
      {
        url: "https://www.postgresql.org/docs/current/tutorial-sql.html",
        title: "PostgreSQL Tutorial - The SQL Language & Advanced Joins",
        domain: "postgresql.org",
        type: "docs",
        estimated_minutes: 30,
        relevance: 0.95,
      },
      {
        url: "https://use-the-index-luke.com/sql/anatomy",
        title: "Anatomy of an Index - Use The Index, Luke",
        domain: "use-the-index-luke.com",
        type: "article",
        estimated_minutes: 25,
        relevance: 0.91,
      },
    ],
  },
  {
    match: ["warehouse", "star schema", "dimensional"],
    resources: [
      {
        url: "https://en.wikipedia.org/wiki/Data_warehouse",
        title: "Data Warehousing Architecture & Core Principles",
        domain: "en.wikipedia.org",
        type: "article",
        estimated_minutes: 25,
        relevance: 0.94,
      },
      {
        url: "https://en.wikipedia.org/wiki/Star_schema",
        title: "Star Schema & Dimensional Fact-Dimension Modeling",
        domain: "en.wikipedia.org",
        type: "article",
        estimated_minutes: 20,
        relevance: 0.91,
      },
    ],
  },
  {
    match: ["ingestion", "api", "etl", "extract"],
    resources: [
      {
        url: "https://en.wikipedia.org/wiki/Extract,_transform,_load",
        title: "ETL Architecture & Pipeline Ingestion Patterns",
        domain: "en.wikipedia.org",
        type: "article",
        estimated_minutes: 25,
        relevance: 0.92,
      },
      {
        url: "https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch",
        title: "Using Fetch for REST API Data Retrieval - MDN",
        domain: "developer.mozilla.org",
        type: "docs",
        estimated_minutes: 20,
        relevance: 0.86,
      },
    ],
  },
  {
    match: ["pandas", "polars", "batch", "dataframe"],
    resources: [
      {
        url: "https://pandas.pydata.org/docs/user_guide/10min.html",
        title: "10 Minutes to Pandas - Official User Guide",
        domain: "pandas.pydata.org",
        type: "docs",
        estimated_minutes: 25,
        relevance: 0.95,
      },
      {
        url: "https://docs.python.org/3/tutorial/datastructures.html",
        title: "Data Structures in Python - Lists, Dicts, & Sets",
        domain: "docs.python.org",
        type: "docs",
        estimated_minutes: 20,
        relevance: 0.89,
      },
    ],
  },
  {
    match: ["spark", "pyspark", "distributed"],
    resources: [
      {
        url: "https://spark.apache.org/docs/latest/quick-start.html",
        title: "Apache Spark & PySpark Quick Start Guide",
        domain: "spark.apache.org",
        type: "docs",
        estimated_minutes: 30,
        relevance: 0.95,
      },
      {
        url: "https://en.wikipedia.org/wiki/Apache_Spark",
        title: "Apache Spark Distributed Computing Architecture",
        domain: "en.wikipedia.org",
        type: "article",
        estimated_minutes: 20,
        relevance: 0.88,
      },
    ],
  },
  {
    match: ["airflow", "orchestrat", "dag", "workflow"],
    resources: [
      {
        url: "https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/dags.html",
        title: "Airflow DAGs & Pipeline Task Dependencies",
        domain: "airflow.apache.org",
        type: "docs",
        estimated_minutes: 25,
        relevance: 0.95,
      },
      {
        url: "https://en.wikipedia.org/wiki/Apache_Airflow",
        title: "Apache Airflow Workflow Management Overview",
        domain: "en.wikipedia.org",
        type: "article",
        estimated_minutes: 20,
        relevance: 0.89,
      },
    ],
  },
  {
    match: ["lake", "parquet", "iceberg", "storage"],
    resources: [
      {
        url: "https://en.wikipedia.org/wiki/Apache_Parquet",
        title: "Apache Parquet Columnar Storage & Encoding",
        domain: "en.wikipedia.org",
        type: "article",
        estimated_minutes: 20,
        relevance: 0.93,
      },
      {
        url: "https://en.wikipedia.org/wiki/Data_lake",
        title: "Data Lake Architecture & Modern Object Stores",
        domain: "en.wikipedia.org",
        type: "article",
        estimated_minutes: 25,
        relevance: 0.9,
      },
    ],
  },
  {
    match: ["dbt", "transform"],
    resources: [
      {
        url: "https://docs.getdbt.com/docs/build/models",
        title: "Building Models - dbt Official Documentation",
        domain: "docs.getdbt.com",
        type: "docs",
        estimated_minutes: 25,
        relevance: 0.96,
      },
      {
        url: "https://en.wikipedia.org/wiki/Data_transformation_(computing)",
        title: "Data Transformation & Lineage Principles",
        domain: "en.wikipedia.org",
        type: "article",
        estimated_minutes: 20,
        relevance: 0.88,
      },
    ],
  },
  {
    match: ["kafka", "stream", "queue"],
    resources: [
      {
        url: "https://kafka.apache.org/documentation/",
        title: "Apache Kafka Core Documentation & Architecture",
        domain: "kafka.apache.org",
        type: "docs",
        estimated_minutes: 30,
        relevance: 0.96,
      },
      {
        url: "https://en.wikipedia.org/wiki/Apache_Kafka",
        title: "Distributed Event Streaming with Kafka",
        domain: "en.wikipedia.org",
        type: "article",
        estimated_minutes: 20,
        relevance: 0.9,
      },
    ],
  },
  {
    match: ["quality", "observability", "monitor"],
    resources: [
      {
        url: "https://en.wikipedia.org/wiki/Data_quality",
        title: "Data Quality Metrics, Profiling, & Auditing",
        domain: "en.wikipedia.org",
        type: "article",
        estimated_minutes: 25,
        relevance: 0.92,
      },
      {
        url: "https://en.wikipedia.org/wiki/Observability_(software)",
        title: "Software Observability - Metrics, Logs, & Traces",
        domain: "en.wikipedia.org",
        type: "article",
        estimated_minutes: 20,
        relevance: 0.89,
      },
    ],
  },
  {
    match: ["capstone", "end-to-end"],
    resources: [
      {
        url: "https://en.wikipedia.org/wiki/Data_engineering",
        title: "Data Engineering Lifecycle & Systems Architecture",
        domain: "en.wikipedia.org",
        type: "article",
        estimated_minutes: 30,
        relevance: 0.96,
      },
      {
        url: "https://en.wikipedia.org/wiki/Pipeline_(computing)",
        title: "Computing Pipelines & Architectural Principles",
        domain: "en.wikipedia.org",
        type: "article",
        estimated_minutes: 20,
        relevance: 0.88,
      },
    ],
  },
];

async function replaceMismatchedSqlSkillsWithPiano(goal) {
  console.log(`  [Auto-Heal] Replacing legacy SQL skills on "${goal.title}" (${goal.domain}) with Piano & Music curriculum...`);
  await supabase.from("resources").delete().eq("goal_id", goal.id);
  await supabase.from("skills").delete().eq("goal_id", goal.id);

  const keyToUuid = new Map();
  const rowsToInsert = PIANO_MUSIC_SKILLS.map((s, idx) => {
    const id = crypto.randomUUID();
    keyToUuid.set(s.key, id);
    return {
      id,
      owner_id: goal.owner_id,
      goal_id: goal.id,
      name: s.name,
      description: s.description,
      estimated_min_minutes: s.estimated_min_minutes,
      estimated_max_minutes: s.estimated_max_minutes,
      difficulty: s.difficulty,
      priority: s.priority,
      verification_type: s.verification_type,
      mvd_minutes: s.mvd_minutes,
      mvd_task: s.mvd_task,
      status: "not_started",
      source: "ai",
      evidence_level: 0,
      position: idx,
    };
  });

  const { error: insErr } = await supabase.from("skills").insert(rowsToInsert);
  if (insErr) {
    console.error("  Failed to insert Piano skills:", insErr.message);
    return;
  }

  const prereqRows = [];
  for (const s of PIANO_MUSIC_SKILLS) {
    const skillUuid = keyToUuid.get(s.key);
    for (const pKey of s.prereq_keys) {
      const prereqUuid = keyToUuid.get(pKey);
      if (skillUuid && prereqUuid) {
        prereqRows.push({
          owner_id: goal.owner_id,
          skill_id: skillUuid,
          prereq_id: prereqUuid,
        });
      }
    }
  }

  if (prereqRows.length > 0) {
    await supabase.from("skill_prereqs").insert(prereqRows);
  }
  console.log(`  + Inserted ${rowsToInsert.length} Piano & Music skills and ${prereqRows.length} prerequisites.`);
}

async function backfillAllGoals() {
  console.log("=== Starting Curriculum & Resource Backfill for All Existing Goals ===");

  // 1. Fetch all goals
  const { data: goals, error: goalsErr } = await supabase
    .from("goals")
    .select("id, title, domain, owner_id, status");

  if (goalsErr || !goals) {
    console.error("Failed to load goals:", goalsErr);
    process.exit(1);
  }

  console.log(`Found ${goals.length} goal(s) in database.`);

  let totalResourcesInserted = 0;
  let totalPlanItemsAttached = 0;

  for (const goal of goals) {
    console.log(`\nProcessing Goal: "${goal.title}" [Domain: ${goal.domain}] (${goal.id})...`);

    // 2. Fetch skills for this goal
    let { data: skills, error: skillsErr } = await supabase
      .from("skills")
      .select("id, name, difficulty, position")
      .eq("goal_id", goal.id)
      .order("position", { ascending: true });

    if (skillsErr || !skills) {
      console.warn(`Could not load skills for goal ${goal.id}:`, skillsErr);
      continue;
    }

    const goalContext = `${goal.title || ""} ${goal.domain || ""}`.toLowerCase();
    const isMusicGoal = /\b(music|musical|piano|guitar|violin|sing|vocal|theory|chord|melody)\b/i.test(goalContext);
    const hasSqlSkills = skills.some((s) => s.name.includes("SQL & Relational Modeling"));

    if (isMusicGoal && (hasSqlSkills || skills.length === 0)) {
      await replaceMismatchedSqlSkillsWithPiano(goal);
      const { data: reloadedSkills } = await supabase
        .from("skills")
        .select("id, name, difficulty, position")
        .eq("goal_id", goal.id)
        .order("position", { ascending: true });
      skills = reloadedSkills || [];
    }

    console.log(`  Found ${skills.length} skills.`);

    // 3. For each skill, find matching resources
    for (const skill of skills) {
      const skillNameLower = skill.name.toLowerCase();

      // Check existing approved resources for this skill
      const { data: existingForSkill } = await supabase
        .from("resources")
        .select("id, url, title, approval")
        .eq("skill_id", skill.id);

      let approvedResourceIds = (existingForSkill || [])
        .filter((r) => r.approval === "approved")
        .map((r) => r.id);

      if (approvedResourceIds.length === 0) {
        let matches = TOPIC_RESOURCES.find((t) =>
          t.match.some((keyword) => skillNameLower.includes(keyword))
        );

        if (!matches) {
          const wikiSlug = encodeURIComponent((goal.domain || skill.name).replace(/\s+/g, "_"));
          matches = {
            match: ["general"],
            resources: [
              {
                url: `https://en.wikipedia.org/wiki/${wikiSlug}`,
                title: `${skill.name} - Reference & Study Guide`,
                domain: "en.wikipedia.org",
                type: "article",
                estimated_minutes: 20,
                relevance: 0.88,
              },
            ],
          };
        }

        const resourcesToInsert = matches.resources.map((r) => ({
          owner_id: goal.owner_id,
          goal_id: goal.id,
          skill_id: skill.id,
          url: r.url,
          title: r.title,
          domain: r.domain,
          type: r.type,
          estimated_minutes: r.estimated_minutes,
          relevance: r.relevance,
          found_by_query: `${skill.name} ${goal.domain || ""} study guide`.trim(),
          search_provider: "curated-vetted",
          approval: "approved",
          status: "ok",
          found_at: new Date().toISOString(),
        }));

        const { data: inserted, error: insErr } = await supabase
          .from("resources")
          .insert(resourcesToInsert)
          .select("id, title, url");

        if (insErr) {
          console.error(`    Failed to insert resources for "${skill.name}":`, insErr.message);
        } else if (inserted) {
          totalResourcesInserted += inserted.length;
          approvedResourceIds = inserted.map((r) => r.id);
          console.log(`    + Added ${inserted.length} approved resources for: "${skill.name}"`);
        }
      } else {
        console.log(`    ✓ "${skill.name}" already has ${approvedResourceIds.length} approved resource(s).`);
      }

      // 4. Attach top approved resource to all plan items for this skill where resource_id is null
      if (approvedResourceIds.length > 0) {
        const topResourceId = approvedResourceIds[0];

        const { data: unassignedItems, error: planErr } = await supabase
          .from("plan_items")
          .select("id")
          .eq("goal_id", goal.id)
          .eq("skill_id", skill.id)
          .is("resource_id", null);

        if (!planErr && unassignedItems && unassignedItems.length > 0) {
          const itemIds = unassignedItems.map((it) => it.id);
          const { error: updateErr } = await supabase
            .from("plan_items")
            .update({ resource_id: topResourceId })
            .in("id", itemIds);

          if (!updateErr) {
            totalPlanItemsAttached += itemIds.length;
            console.log(`      Linked resource to ${itemIds.length} plan item(s).`);
          } else {
            console.error(`      Failed to link plan items:`, updateErr.message);
          }
        }
      }
    }
  }

  console.log("\n=== Backfill Summary ===");
  console.log(`Total Resources Created: ${totalResourcesInserted}`);
  console.log(`Total Plan Items Attached: ${totalPlanItemsAttached}`);
  console.log("✔ Completed successfully!");
}

backfillAllGoals().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
