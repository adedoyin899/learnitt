import { AIProvider, AIStructuredArgs, AIStructuredResponse, AITask } from "../types";

export class MockAIProvider implements AIProvider {
  readonly id: string;
  private readonly modelName: string;
  public readonly recordedCalls: AIStructuredArgs[] = [];

  constructor(options?: { id?: string; model?: string }) {
    this.id = options?.id || "mock-ai";
    this.modelName = options?.model ? `mock-ai-${options.model}` : "mock-ai-v1-deterministic";
  }

  async generateStructured<T>(args: AIStructuredArgs): Promise<AIStructuredResponse<T>> {
    this.recordedCalls.push(args);
    const fixtureData = this.getDeterministicFixture(args.task, args.user);
    return {
      data: fixtureData as unknown as T,
      usage: {
        inputTokens: Math.max(Math.floor(args.user.length / 4), 10),
        outputTokens: 150,
      },
      modelVersion: this.modelName,
    };
  }

  private getDeterministicFixture(task: AITask, prompt: string): unknown {
    const titleMatch = prompt.match(/Title:\s*([^\n\r]+)/i);
    const domainMatch = prompt.match(/Domain:\s*([^\n\r]+)/i);
    const goalContext =
      titleMatch || domainMatch
        ? `${titleMatch?.[1] || ""} ${domainMatch?.[1] || ""}`.trim()
        : prompt;
    const goalLower = goalContext.toLowerCase();

    const isHealth = /\b(health|clinical|biostatistics|epidemiology|medical)\b/i.test(goalLower);
    const isCulinaryOrOtherArts = /\b(culinary|martial|liberal|language\s+arts|pastry|baking|cooking)\b/i.test(goalLower);
    const isArt =
      !isCulinaryOrOtherArts &&
      /\b(art|arts|paint|painting|draw|drawing|illustration|sketch|watercolor)\b/i.test(goalLower);
    const isMusic = /\b(piano|music|musical|guitar|violin|keyboard|chord|melody|rhythm|jazz|classical|singing|vocal)\b/i.test(goalLower);
    const isDataEng =
      /\b(data\s*engineer|data\s*engineering|sql|database|warehouse|spark|airflow|dbt|kafka|pipeline)\b/i.test(goalLower) ||
      (!titleMatch && !domainMatch && !isHealth && !isArt && !isMusic);

    switch (task) {
      case "skill_graph":
        if (isHealth) {
          return {
            skills: [
              {
                id: "sk_ha_01",
                name: "Probability Distributions in Clinical Medicine",
                description: "Core random variables, expectation, variance, binomial, and Poisson distributions.",
                prereq_ids: [],
                estimated_minutes: { min: 120, max: 180 },
                difficulty: 2,
                verification_type: "recall",
                mvd_minutes: 15,
                mvd_task: "Calculate expected value and variance for clinical trial outcome variables.",
              },
              {
                id: "sk_ha_02",
                name: "Statistical Inference & Hypothesis Testing",
                description: "Null hypothesis testing, p-values, confidence intervals, and power calculations.",
                prereq_ids: ["sk_ha_01"],
                estimated_minutes: { min: 90, max: 150 },
                difficulty: 2,
                verification_type: "applied",
                mvd_minutes: 15,
                mvd_task: "Compute 95% confidence intervals for a difference between treatment and control means.",
              },
              {
                id: "sk_ha_03",
                name: "Linear and Logistic Regression in Healthcare",
                description: "Modeling continuous and binary health outcomes, odds ratios, and covariate adjustment.",
                prereq_ids: ["sk_ha_02"],
                estimated_minutes: { min: 120, max: 210 },
                difficulty: 2,
                verification_type: "applied",
                mvd_minutes: 15,
                mvd_task: "Fit a logistic regression model in R/Python and interpret odds ratios with 95% CI.",
              },
              {
                id: "sk_ha_04",
                name: "Survival Analysis & Time-to-Event Data",
                description: "Kaplan-Meier estimation, log-rank tests, and Cox proportional hazards models.",
                prereq_ids: ["sk_ha_02", "sk_ha_03"],
                estimated_minutes: { min: 120, max: 240 },
                difficulty: 3,
                verification_type: "applied",
                mvd_minutes: 20,
                mvd_task: "Plot a Kaplan-Meier survival curve and calculate median survival time.",
              },
              {
                id: "sk_ha_05",
                name: "Study Designs: Cohort, Case-Control & RCTs",
                description: "Observational vs experimental designs, bias, confounding, and causal inference.",
                prereq_ids: ["sk_ha_01"],
                estimated_minutes: { min: 90, max: 150 },
                difficulty: 2,
                verification_type: "recall",
                mvd_minutes: 15,
                mvd_task: "Identify potential confounding variables in an observational cohort study protocol.",
              },
              {
                id: "sk_ha_06",
                name: "Measures of Disease Occurrence & Risk",
                description: "Incidence, prevalence, relative risk, attributable risk, and standardized rates.",
                prereq_ids: ["sk_ha_05"],
                estimated_minutes: { min: 60, max: 120 },
                difficulty: 1,
                verification_type: "recall",
                mvd_minutes: 15,
                mvd_task: "Calculate risk ratio and absolute risk reduction from a 2x2 clinical contingency table.",
              },
              {
                id: "sk_ha_07",
                name: "Missing Data & Imputation in Health Studies",
                description: "Mechanisms of missingness (MCAR, MAR, MNAR) and multiple imputation methods.",
                prereq_ids: ["sk_ha_03", "sk_ha_05"],
                estimated_minutes: { min: 90, max: 180 },
                difficulty: 3,
                verification_type: "applied",
                mvd_minutes: 15,
                mvd_task: "Evaluate missing data mechanisms and set up mice imputation in R.",
              },
              {
                id: "sk_ha_08",
                name: "Meta-Analysis & Systematic Review Methods",
                description: "Effect sizes, forest plots, heterogeneity (I-squared), and publication bias.",
                prereq_ids: ["sk_ha_05", "sk_ha_06"],
                estimated_minutes: { min: 90, max: 180 },
                difficulty: 3,
                verification_type: "applied",
                mvd_minutes: 15,
                mvd_task: "Construct a forest plot from 5 published trials and assess heterogeneity.",
              },
              {
                id: "sk_ha_09",
                name: "Electronic Health Records & Clinical Coding",
                description: "ICD-10, SNOMED-CT, LOINC, and RxNorm terminology mapping and ontologies.",
                prereq_ids: ["sk_ha_06"],
                estimated_minutes: { min: 90, max: 150 },
                difficulty: 2,
                verification_type: "recall",
                mvd_minutes: 15,
                mvd_task: "Map clinical diagnosis concepts to ICD-10 and SNOMED-CT identifiers.",
              },
              {
                id: "sk_ha_10",
                name: "Common Data Models: OMOP CDM & FHIR",
                description: "Observational Medical Outcomes Partnership schema, HL7 FHIR resources.",
                prereq_ids: ["sk_ha_09"],
                estimated_minutes: { min: 120, max: 240 },
                difficulty: 3,
                verification_type: "applied",
                mvd_minutes: 15,
                mvd_task: "Design an OMOP CDM person and condition_occurrence table mapping schema.",
              },
              {
                id: "sk_ha_11",
                name: "Clinical Data Extraction & SQL Cohort Building",
                description: "Extracting patient cohorts, index dates, and adverse event flags from EHR.",
                prereq_ids: ["sk_ha_09", "sk_ha_10"],
                estimated_minutes: { min: 120, max: 210 },
                difficulty: 2,
                verification_type: "applied",
                mvd_minutes: 15,
                mvd_task: "Write a SQL query extracting patient cohorts with at least 2 outpatient visits.",
              },
              {
                id: "sk_ha_12",
                name: "Phenotyping Algorithms & Validation",
                description: "Rule-based and probabilistic clinical phenotyping for disease cohorts.",
                prereq_ids: ["sk_ha_10", "sk_ha_11"],
                estimated_minutes: { min: 90, max: 180 },
                difficulty: 3,
                verification_type: "applied",
                mvd_minutes: 15,
                mvd_task: "Define positive predictive value and sensitivity metrics for a diabetes phenotype.",
              },
              {
                id: "sk_ha_13",
                name: "Clinical Risk Prediction Models",
                description: "Developing, validating, and reporting multivariable models using TRIPOD guidelines.",
                prereq_ids: ["sk_ha_03", "sk_ha_11"],
                estimated_minutes: { min: 120, max: 240 },
                difficulty: 3,
                verification_type: "applied",
                mvd_minutes: 20,
                mvd_task: "Draft a TRIPOD checklist table for a 30-day hospital readmission model.",
              },
              {
                id: "sk_ha_14",
                name: "Discrimination, Calibration & Clinical Utility",
                description: "C-statistic / AUROC, Brier score, calibration curves, and decision curve analysis.",
                prereq_ids: ["sk_ha_13"],
                estimated_minutes: { min: 90, max: 180 },
                difficulty: 3,
                verification_type: "applied",
                mvd_minutes: 15,
                mvd_task: "Plot calibration belt curves and calculate Brier score for risk predictions.",
              },
              {
                id: "sk_ha_15",
                name: "Ethics, Fairness & Privacy in Healthcare AI",
                description: "Algorithmic bias across demographics, differential privacy, HIPAA, and GDPR.",
                prereq_ids: ["sk_ha_13"],
                estimated_minutes: { min: 60, max: 120 },
                difficulty: 2,
                verification_type: "recall",
                mvd_minutes: 15,
                mvd_task: "Audit predictive performance parity across patient age and demographic groups.",
              },
              {
                id: "sk_ha_16",
                name: "Applied Capstone: Health Analytics Study",
                description: "End-to-end cohort selection, statistical modeling, validation, and reproducible report.",
                prereq_ids: ["sk_ha_04", "sk_ha_12", "sk_ha_14", "sk_ha_15"],
                estimated_minutes: { min: 180, max: 360 },
                difficulty: 4,
                verification_type: "artifact",
                mvd_minutes: 25,
                mvd_task: "Produce an end-to-end reproducible RMarkdown / Jupyter health study analysis.",
              },
            ],
          };
        }

        if (isArt) {
          return {
            skills: [
              {
                id: "sk_art_01",
                name: "Color Theory & Harmonies",
                description: "Color wheels, complementary contrasts, and hue-saturation-value relationships.",
                prereq_ids: [],
                estimated_minutes: { min: 60, max: 120 },
                difficulty: 1,
                verification_type: "recall",
                mvd_minutes: 15,
                mvd_task: "Mix a 12-step color wheel identifying complementary and analogous pairs.",
              },
              {
                id: "sk_art_02",
                name: "Drawing Fundamentals & Gesture",
                description: "Mark-making, line weight, proportion, and dynamic gesture capture.",
                prereq_ids: [],
                estimated_minutes: { min: 60, max: 120 },
                difficulty: 1,
                verification_type: "applied",
                mvd_minutes: 15,
                mvd_task: "Complete five 2-minute gesture drawings focusing on continuous line flow.",
              },
              {
                id: "sk_art_03",
                name: "Perspective & Compositional Space",
                description: "One and two-point perspective, vanishing points, and atmospheric depth.",
                prereq_ids: ["sk_art_02"],
                estimated_minutes: { min: 90, max: 150 },
                difficulty: 2,
                verification_type: "applied",
                mvd_minutes: 15,
                mvd_task: "Construct an interior grid using two vanishing points and accurate scale.",
              },
              {
                id: "sk_art_04",
                name: "Chiaroscuro & Value Contrast",
                description: "Form modeling, light source direction, cast shadows, and 5-value scale.",
                prereq_ids: ["sk_art_02", "sk_art_03"],
                estimated_minutes: { min: 90, max: 180 },
                difficulty: 2,
                verification_type: "applied",
                mvd_minutes: 15,
                mvd_task: "Render a geometric sphere using a 5-step value gradient with core shadow.",
              },
              {
                id: "sk_art_05",
                name: "Materials, Pigments & Brushwork",
                description: "Selecting brushes, supports, priming gesso, and paint consistency.",
                prereq_ids: [],
                estimated_minutes: { min: 60, max: 90 },
                difficulty: 1,
                verification_type: "recall",
                mvd_minutes: 15,
                mvd_task: "Prepare a primed surface and test 4 distinct brush strokes with medium.",
              },
              {
                id: "sk_art_06",
                name: "Color Temperature & Palette Mixing",
                description: "Warm vs cool variants of primary colors, neutral grays, and skin tones.",
                prereq_ids: ["sk_art_01", "sk_art_05"],
                estimated_minutes: { min: 90, max: 150 },
                difficulty: 2,
                verification_type: "applied",
                mvd_minutes: 15,
                mvd_task: "Mix three chromatic grays using warm and cool primaries without tube black.",
              },
              {
                id: "sk_art_07",
                name: "Underpainting & Imprimatura",
                description: "Establishing composition, tonal structure, and warm ground washes.",
                prereq_ids: ["sk_art_04", "sk_art_06"],
                estimated_minutes: { min: 90, max: 180 },
                difficulty: 2,
                verification_type: "applied",
                mvd_minutes: 15,
                mvd_task: "Execute an oil/acrylic imprimatura wash and wipe out high-key highlights.",
              },
              {
                id: "sk_art_08",
                name: "Glazing & Layering Techniques",
                description: "Fat-over-lean rules, transparent glazing, scumbling, and impasto highlights.",
                prereq_ids: ["sk_art_07"],
                estimated_minutes: { min: 120, max: 210 },
                difficulty: 3,
                verification_type: "applied",
                mvd_minutes: 20,
                mvd_task: "Apply two translucent glaze layers over a dried monochrome underpainting.",
              },
              {
                id: "sk_art_09",
                name: "Figure Drawing & Anatomical Proportions",
                description: "Skeletal landmarks, head-height measurements, and muscular forms.",
                prereq_ids: ["sk_art_02", "sk_art_04"],
                estimated_minutes: { min: 120, max: 240 },
                difficulty: 3,
                verification_type: "applied",
                mvd_minutes: 20,
                mvd_task: "Draw a standing figure establishing the 7.5 head proportion guidelines.",
              },
              {
                id: "sk_art_10",
                name: "Still Life & Edge Control",
                description: "Hard, soft, lost, and found edges across varying surface textures.",
                prereq_ids: ["sk_art_06", "sk_art_07"],
                estimated_minutes: { min: 90, max: 180 },
                difficulty: 2,
                verification_type: "applied",
                mvd_minutes: 15,
                mvd_task: "Paint a simple still life demonstrating distinct soft and lost edges.",
              },
              {
                id: "sk_art_11",
                name: "Plein Air & Direct Observation",
                description: "Rapid plein air color notation, changing light conditions, and simplification.",
                prereq_ids: ["sk_art_08", "sk_art_10"],
                estimated_minutes: { min: 120, max: 240 },
                difficulty: 3,
                verification_type: "applied",
                mvd_minutes: 20,
                mvd_task: "Complete a 30-minute outdoor landscape study capturing primary light direction.",
              },
              {
                id: "sk_art_12",
                name: "Master Copy & Finished Capstone Work",
                description: "Synthesizing drawing, value, color, edge control, and personal expression.",
                prereq_ids: ["sk_art_08", "sk_art_09", "sk_art_11"],
                estimated_minutes: { min: 180, max: 360 },
                difficulty: 4,
                verification_type: "artifact",
                mvd_minutes: 25,
                mvd_task: "Produce an original finished capstone painting incorporating underpainting and glazing.",
              },
            ],
          };
        }

        if (isMusic) {
          return {
            skills: [
              {
                id: "sk_mus_01",
                name: "Keyboard Posture, Hand Position & Finger Numbering",
                description: "Ergonomic bench height, curved finger posture, relaxed wrist alignment, and 1-5 finger numbering.",
                prereq_ids: [],
                estimated_minutes: { min: 45, max: 90 },
                difficulty: 1,
                verification_type: "applied",
                mvd_minutes: 15,
                mvd_task: "Play five-finger C major patterns hands separately with relaxed wrists at 60 BPM.",
              },
              {
                id: "sk_mus_02",
                name: "Musical Staff Notation: Treble & Bass Clef Reading",
                description: "Grand staff note identification, ledger lines, middle C orientation, and interval recognition.",
                prereq_ids: [],
                estimated_minutes: { min: 60, max: 120 },
                difficulty: 1,
                verification_type: "recall",
                mvd_minutes: 15,
                mvd_task: "Sight-read and name 20 randomized notes across treble and bass clefs in under 2 minutes.",
              },
              {
                id: "sk_mus_03",
                name: "Rhythm, Time Signatures & Metronome Timing",
                description: "Whole, half, quarter, eighth, and dotted notes, rests, 4/4 and 3/4 meter subdivision.",
                prereq_ids: ["sk_mus_01"],
                estimated_minutes: { min: 60, max: 120 },
                difficulty: 1,
                verification_type: "applied",
                mvd_minutes: 15,
                mvd_task: "Clap and count aloud 8 bars of mixed quarter and eighth-note rhythms with a metronome.",
              },
              {
                id: "sk_mus_04",
                name: "Major Scales & Thumb-Under Technique",
                description: "Whole-half step tetra-chord patterns, C, G, D, and F major scales, smooth thumb crossings.",
                prereq_ids: ["sk_mus_01", "sk_mus_02"],
                estimated_minutes: { min: 90, max: 150 },
                difficulty: 2,
                verification_type: "applied",
                mvd_minutes: 15,
                mvd_task: "Play C and G major two-octave scales hands separately with clean thumb-under transitions.",
              },
              {
                id: "sk_mus_05",
                name: "Triads, Chord Construction & Inversions",
                description: "Major, minor, diminished triads, root position, first and second inversions across keys.",
                prereq_ids: ["sk_mus_02", "sk_mus_04"],
                estimated_minutes: { min: 90, max: 180 },
                difficulty: 2,
                verification_type: "applied",
                mvd_minutes: 15,
                mvd_task: "Play root, 1st, and 2nd inversions for C, F, G, and A minor triads smoothly.",
              },
              {
                id: "sk_mus_06",
                name: "Two-Hand Coordination & Independence",
                description: "Playing melody in right hand over left-hand bass roots, Alberti bass, and broken chords.",
                prereq_ids: ["sk_mus_03", "sk_mus_05"],
                estimated_minutes: { min: 120, max: 210 },
                difficulty: 2,
                verification_type: "applied",
                mvd_minutes: 20,
                mvd_task: "Practice 8 bars playing a steady left-hand broken chord pattern under a right-hand melody.",
              },
              {
                id: "sk_mus_07",
                name: "Natural, Harmonic & Melodic Minor Scales",
                description: "Relative minor relationships, circle of fifths, and fingerings for A, E, and D minor.",
                prereq_ids: ["sk_mus_04"],
                estimated_minutes: { min: 90, max: 150 },
                difficulty: 2,
                verification_type: "applied",
                mvd_minutes: 15,
                mvd_task: "Play A harmonic minor two octaves hands together at a steady 72 BPM.",
              },
              {
                id: "sk_mus_08",
                name: "Diatonic Chord Progressions & Cadences",
                description: "I-IV-V-I, ii-V-I, and I-V-vi-IV progressions, voice leading, and harmonic cadences.",
                prereq_ids: ["sk_mus_05", "sk_mus_06"],
                estimated_minutes: { min: 90, max: 180 },
                difficulty: 2,
                verification_type: "applied",
                mvd_minutes: 15,
                mvd_task: "Play I-IV-V-I and ii-V-I progressions in three keys using closest-inversion voice leading.",
              },
              {
                id: "sk_mus_09",
                name: "Articulation, Dynamics & Damper Pedal Control",
                description: "Legato vs staccato phrasing, crescendo/diminuendo shading, and syncopated pedaling.",
                prereq_ids: ["sk_mus_06"],
                estimated_minutes: { min: 90, max: 150 },
                difficulty: 2,
                verification_type: "applied",
                mvd_minutes: 15,
                mvd_task: "Connect a 4-chord progression using syncopated damper pedaling with zero harmonic blur.",
              },
              {
                id: "sk_mus_10",
                name: "Seventh Chords & Accompaniment Voicings",
                description: "Major 7th, dominant 7th, and minor 7th chords, shell voicings, and rhythmic comping.",
                prereq_ids: ["sk_mus_07", "sk_mus_08"],
                estimated_minutes: { min: 120, max: 210 },
                difficulty: 3,
                verification_type: "applied",
                mvd_minutes: 20,
                mvd_task: "Voice a ii7-V7-Imaj7 progression in C and F major with root in left hand and guide tones in right.",
              },
              {
                id: "sk_mus_11",
                name: "Sight-Reading & Ear Training Fluency",
                description: "Reading unfamiliar lead sheets and two-stave pieces at tempo, melodic interval dictation.",
                prereq_ids: ["sk_mus_08", "sk_mus_09"],
                estimated_minutes: { min: 90, max: 180 },
                difficulty: 3,
                verification_type: "applied",
                mvd_minutes: 15,
                mvd_task: "Sight-read an unfamiliar 16-bar piece slowly hands together without stopping at barlines.",
              },
              {
                id: "sk_mus_12",
                name: "Complete Repertoire Performance Capstone",
                description: "Memorization, expressive interpretation, tempo stability, and full solo piece recording.",
                prereq_ids: ["sk_mus_09", "sk_mus_10", "sk_mus_11"],
                estimated_minutes: { min: 150, max: 300 },
                difficulty: 4,
                verification_type: "artifact",
                mvd_minutes: 25,
                mvd_task: "Record a complete play-through of your chosen repertoire piece from memory with dynamics.",
              },
            ],
          };
        }

        if (!isDataEng) {
          const subject = (titleMatch?.[1] || domainMatch?.[1] || "Subject").trim();
          return {
            skills: [
              {
                id: "sk_gen_01",
                name: `${subject}: Core Principles & Foundations`,
                description: `Essential terminology, foundational concepts, and mental models for ${subject}.`,
                prereq_ids: [],
                estimated_minutes: { min: 60, max: 120 },
                difficulty: 1,
                verification_type: "recall",
                mvd_minutes: 15,
                mvd_task: `Summarize the 5 foundational principles of ${subject} in your own words.`,
              },
              {
                id: "sk_gen_02",
                name: `${subject}: Essential Tools & Setup`,
                description: `Setting up the core workspace, instruments, materials, and standard workflow for ${subject}.`,
                prereq_ids: [],
                estimated_minutes: { min: 60, max: 90 },
                difficulty: 1,
                verification_type: "applied",
                mvd_minutes: 15,
                mvd_task: `Complete a 15-minute foundational drill using the primary tools of ${subject}.`,
              },
              {
                id: "sk_gen_03",
                name: `${subject}: Fundamental Techniques`,
                description: `Step-by-step practice of the primary building blocks and repeatable exercises in ${subject}.`,
                prereq_ids: ["sk_gen_01", "sk_gen_02"],
                estimated_minutes: { min: 90, max: 150 },
                difficulty: 2,
                verification_type: "applied",
                mvd_minutes: 15,
                mvd_task: `Execute 3 focused repetitions of core ${subject} technique with self-check.`,
              },
              {
                id: "sk_gen_04",
                name: `${subject}: Structure & Composition`,
                description: `Understanding how components combine into cohesive structures within ${subject}.`,
                prereq_ids: ["sk_gen_03"],
                estimated_minutes: { min: 90, max: 180 },
                difficulty: 2,
                verification_type: "applied",
                mvd_minutes: 15,
                mvd_task: `Analyze and diagram one well-known example in ${subject}.`,
              },
              {
                id: "sk_gen_05",
                name: `${subject}: Intermediate Patterns & Methods`,
                description: `Expanding fluency with common patterns, idioms, and structured problem solving in ${subject}.`,
                prereq_ids: ["sk_gen_03"],
                estimated_minutes: { min: 90, max: 180 },
                difficulty: 2,
                verification_type: "applied",
                mvd_minutes: 15,
                mvd_task: `Practice one intermediate pattern in ${subject} and note key adjustments.`,
              },
              {
                id: "sk_gen_06",
                name: `${subject}: Guided Applied Practice`,
                description: `Completing structured end-to-end exercises that combine multiple ${subject} skills.`,
                prereq_ids: ["sk_gen_04", "sk_gen_05"],
                estimated_minutes: { min: 120, max: 210 },
                difficulty: 2,
                verification_type: "applied",
                mvd_minutes: 20,
                mvd_task: `Complete a 20-minute applied study session producing a small working output.`,
              },
              {
                id: "sk_gen_07",
                name: `${subject}: Diagnostics & Error Correction`,
                description: `Identifying common pitfalls, refining precision, and self-correcting technique in ${subject}.`,
                prereq_ids: ["sk_gen_05"],
                estimated_minutes: { min: 90, max: 150 },
                difficulty: 3,
                verification_type: "applied",
                mvd_minutes: 15,
                mvd_task: `Review recent work in ${subject} and fix 2 specific areas of friction.`,
              },
              {
                id: "sk_gen_08",
                name: `${subject}: Advanced Concepts & Nuance`,
                description: `Deepening mastery of subtle mechanics, style, and higher-complexity scenarios in ${subject}.`,
                prereq_ids: ["sk_gen_06", "sk_gen_07"],
                estimated_minutes: { min: 120, max: 210 },
                difficulty: 3,
                verification_type: "applied",
                mvd_minutes: 20,
                mvd_task: `Perform a focused drill on one advanced variation in ${subject}.`,
              },
              {
                id: "sk_gen_09",
                name: `${subject}: Case Studies & Master Analysis`,
                description: `Studying benchmark works and real-world applications in ${subject}.`,
                prereq_ids: ["sk_gen_06"],
                estimated_minutes: { min: 90, max: 150 },
                difficulty: 3,
                verification_type: "recall",
                mvd_minutes: 15,
                mvd_task: `Write 3 takeaways from studying an expert reference in ${subject}.`,
              },
              {
                id: "sk_gen_10",
                name: `${subject}: Independent Variation & Adaptation`,
                description: `Adapting techniques to novel prompts and unscripted scenarios in ${subject}.`,
                prereq_ids: ["sk_gen_08", "sk_gen_09"],
                estimated_minutes: { min: 120, max: 210 },
                difficulty: 3,
                verification_type: "applied",
                mvd_minutes: 20,
                mvd_task: `Create an original short study applying two techniques from ${subject}.`,
              },
              {
                id: "sk_gen_11",
                name: `${subject}: Fluency, Speed & Polish`,
                description: `Building consistency, confidence, and quality under realistic conditions in ${subject}.`,
                prereq_ids: ["sk_gen_10"],
                estimated_minutes: { min: 90, max: 180 },
                difficulty: 3,
                verification_type: "applied",
                mvd_minutes: 15,
                mvd_task: `Run a timed 15-minute fluency session in ${subject}.`,
              },
              {
                id: "sk_gen_12",
                name: `${subject}: Final Capstone Project`,
                description: `Planning, executing, and reviewing a complete, polished ${subject} capstone work.`,
                prereq_ids: ["sk_gen_10", "sk_gen_11"],
                estimated_minutes: { min: 180, max: 300 },
                difficulty: 4,
                verification_type: "artifact",
                mvd_minutes: 25,
                mvd_task: `Complete and document the next milestone of your ${subject} capstone.`,
              },
            ],
          };
        }

        return {
          skills: [
            {
              id: "sk_sql_basics",
              name: "SQL & Relational Modeling Fundamentals",
              description: "Core syntax, data structures, and relational queries.",
              prereq_ids: [],
              estimated_minutes: { min: 60, max: 120 },
              difficulty: 1,
              verification_type: "recall",
              mvd_minutes: 15,
              mvd_task: "Write a function processing a CSV dictionary into key-value pairs.",
            },
            {
              id: "sk_02",
              name: "SQL & Relational Modeling",
              description: "Relational schemas, constraints, joins, and indexing strategies.",
              prereq_ids: [],
              estimated_minutes: { min: 90, max: 180 },
              difficulty: 1,
              verification_type: "applied",
              mvd_minutes: 15,
              mvd_task: "Write a SQL query using CTE and window function on sample orders.",
            },
            {
              id: "sk_03",
              name: "Data Warehousing & Star Schemas",
              description: "Fact and dimension modeling, SCD Type 2, and grain definition.",
              prereq_ids: ["sk_02"],
              estimated_minutes: { min: 90, max: 180 },
              difficulty: 2,
              verification_type: "applied",
              mvd_minutes: 15,
              mvd_task: "Sketch a star schema with dim_customer and fact_orders on paper.",
            },
            {
              id: "sk_04",
              name: "Data Ingestion & APIs",
              description: "Consuming REST APIs, pagination, rate-limiting, and error handling.",
              prereq_ids: ["sk_sql_basics"],
              estimated_minutes: { min: 60, max: 120 },
              difficulty: 2,
              verification_type: "applied",
              mvd_minutes: 15,
              mvd_task: "Implement exponential backoff retry loop in Python for a mock endpoint.",
            },
            {
              id: "sk_05",
              name: "Batch Processing with Pandas/Polars",
              description: "Vectorized transformations, aggregations, and memory optimization.",
              prereq_ids: ["sk_sql_basics"],
              estimated_minutes: { min: 90, max: 150 },
              difficulty: 2,
              verification_type: "applied",
              mvd_minutes: 15,
              mvd_task: "Profile memory usage of a DataFrame before and after type downcasting.",
            },
            {
              id: "sk_06",
              name: "Distributed Computing with PySpark",
              description: "Spark DataFrame API, partitioning, shuffles, and broadcast joins.",
              prereq_ids: ["sk_sql_basics", "sk_02"],
              estimated_minutes: { min: 120, max: 240 },
              difficulty: 3,
              verification_type: "applied",
              mvd_minutes: 20,
              mvd_task: "Explain why narrow transformations do not trigger a shuffle stage.",
            },
            {
              id: "sk_07",
              name: "Workflow Orchestration with Airflow",
              description: "DAG definition, operators, task dependencies, and idempotent retries.",
              prereq_ids: ["sk_sql_basics", "sk_04"],
              estimated_minutes: { min: 90, max: 180 },
              difficulty: 3,
              verification_type: "applied",
              mvd_minutes: 15,
              mvd_task: "Draft an Airflow DAG with 3 tasks using taskflow API syntax.",
            },
            {
              id: "sk_08",
              name: "Data Lake Storage & Parquet/Iceberg",
              description: "Columnar formats, compression codecs, partitioning, and lakehouses.",
              prereq_ids: ["sk_03", "sk_06"],
              estimated_minutes: { min: 90, max: 150 },
              difficulty: 3,
              verification_type: "recall",
              mvd_minutes: 15,
              mvd_task: "Inspect Parquet metadata file statistics using pyarrow.",
            },
            {
              id: "sk_09",
              name: "Data Transformation with dbt",
              description: "Modularity, ref(), tests, documentation, and incremental models.",
              prereq_ids: ["sk_02", "sk_03"],
              estimated_minutes: { min: 90, max: 180 },
              difficulty: 2,
              verification_type: "applied",
              mvd_minutes: 15,
              mvd_task: "Write a dbt generic test YAML block for unique and not-null constraints.",
            },
            {
              id: "sk_10",
              name: "Streaming Foundations (Kafka)",
              description: "Topics, partitions, consumer groups, offset management, and delivery semantics.",
              prereq_ids: ["sk_sql_basics"],
              estimated_minutes: { min: 120, max: 240 },
              difficulty: 4,
              verification_type: "recall",
              mvd_minutes: 20,
              mvd_task: "Diagram producer, broker, and consumer group offset commit flow.",
            },
            {
              id: "sk_11",
              name: "Data Quality & Observability",
              description: "Great Expectations, anomaly alerts, SLA tracking, and schema validation.",
              prereq_ids: ["sk_07", "sk_09"],
              estimated_minutes: { min: 60, max: 120 },
              difficulty: 2,
              verification_type: "applied",
              mvd_minutes: 15,
              mvd_task: "Formulate 3 expectation suites for an incoming raw data table.",
            },
            {
              id: "sk_12",
              name: "End-to-End Pipeline Capstone",
              description: "Build an automated, tested ELT pipeline with ingestion, staging, and analytics.",
              prereq_ids: ["sk_07", "sk_08", "sk_09", "sk_11"],
              estimated_minutes: { min: 180, max: 360 },
              difficulty: 4,
              verification_type: "artifact",
              mvd_minutes: 25,
              mvd_task: "Commit a clean pipeline architecture diagram and test suite README.",
            },
          ],
        };

      case "link_materials": {
        let skillId = "sk_01";
        let matId = "mat_sample_1";
        try {
          const skillsMatch = prompt.match(/Skills:\s*(\[\s*\{[\s\S]*?\}\s*\])/);
          const chunksMatch = prompt.match(/(?:Material Chunks|Materials):\s*(\[\s*\{[\s\S]*?\}\s*\])/);
          if (skillsMatch) {
            const parsedSkills = JSON.parse(skillsMatch[1]);
            if (parsedSkills.length > 0 && parsedSkills[0].id) {
              skillId = parsedSkills[0].id;
            }
          }
          if (chunksMatch) {
            const parsedChunks = JSON.parse(chunksMatch[1]);
            if (parsedChunks.length > 0 && (parsedChunks[0].material_id || parsedChunks[0].id)) {
              matId = parsedChunks[0].material_id || parsedChunks[0].id;
            }
          }
        } catch {
          // fallback to defaults
        }

        return {
          links: [
            {
              skill_id: skillId,
              material_id: matId,
              confidence: 0.95,
              reason: "Directly covers core domain concepts.",
            },
          ],
        };
      }

      case "search_queries": {
        const skillMatch = prompt.match(/Skill:\s*([^\n\r]+)/i);
        const skill = skillMatch ? skillMatch[1].trim() : "";
        const levelMatch = prompt.match(/Level:\s*([^\n\r]+)/i);
        const level = levelMatch ? levelMatch[1].trim() : "beginner";

        if (!skill || skill.toLowerCase().includes("sql") || prompt.includes("SQL fundamentals")) {
          return {
            queries: [
              "SQL fundamentals window functions tutorial",
              "PostgreSQL indexing best practices beginner",
            ],
          };
        }

        return {
          queries: [
            `${skill} ${level} practical guide tutorial`,
            `${skill} core principles documentation`,
            `${skill} best practices guide`,
          ],
        };
      }

      case "classify_resource": {
        try {
          const match = prompt.match(/Classify the following batch of candidate resources:\s*(\[\s*\{[\s\S]*?\}\s*\])/);
          if (match) {
            const list = JSON.parse(match[1]);
            return {
              candidates: list.map((c: any) => ({
                url: c.url,
                type: c.url?.includes("video") || c.url?.includes("youtube") ? "video" : c.url?.includes("docs") ? "docs" : "article",
                estimated_minutes: 25,
                relevance: 0.88,
              })),
            };
          }
        } catch {
          // fallback
        }
        return {
          type: "article",
          estimated_minutes: 20,
          relevance: 0.9,
        };
      }

      case "make_quiz": {
        let chunkIds = ["chunk_sql_01"];
        try {
          const chunkMatch = prompt.match(/Context Chunks:\s*(\[\s*\{[\s\S]*?\}\s*\])/);
          if (chunkMatch) {
            const parsedChunks = JSON.parse(chunkMatch[1]);
            if (parsedChunks.length > 0 && parsedChunks[0].id) {
              chunkIds = parsedChunks.map((c: any) => c.id);
            }
          }
        } catch {
          // fallback
        }

        const validChunkId = chunkIds[0] || "chunk_sql_01";
        const skillMatch = prompt.match(/Skill:\s*([^\n\r(]+)(?:\s*\(id:\s*([^)]+)\))?/i);
        const skillName = skillMatch ? skillMatch[1].trim() : "SQL & Relational Modeling";
        const skillId = skillMatch?.[2]?.trim() || "sk_02";
        const skillLower = skillName.toLowerCase();

        const isSqlSkill =
          /\b(sql|relational|join|warehouse|star schema|spark|airflow|dbt|kafka|pandas|polars|parquet|iceberg|ingestion|data quality|pipeline)\b/i.test(
            skillLower
          ) || !skillMatch;

        if (!isSqlSkill) {
          const isMusicSkill =
            /\b(piano|keyboard|clef|staff|notation|rhythm|metronome|scale|triad|chord|inversion|harmony|pedal|arpeggio|sight-reading|ear training|repertoire|hand)\b/i.test(
              skillLower
            );
          const isArtSkill =
            /\b(color|paint|draw|sketch|chiaroscuro|perspective|anatomy|brush|glazing|composition|canvas|portfolio)\b/i.test(
              skillLower
            );

          if (isMusicSkill) {
            return {
              questions: [
                {
                  id: `q_mus_mc_${skillId}`,
                  type: "recall_mc",
                  prompt: `In "${skillName}", what is the primary technical focus for building clean, tension-free execution at the keyboard?`,
                  options: [
                    "Maintaining relaxed wrist alignment, curved fingers, and a steady rhythmic pulse",
                    "Locking the wrists and pressing keys with flat fingers for maximum volume",
                    "Playing as fast as possible before learning the note patterns",
                    "Holding the sustain pedal down continuously across all harmonic changes",
                  ],
                  answer_key: 0,
                  rubric: null,
                  source_chunk_ids: [validChunkId],
                  skill_id: skillId,
                },
                {
                  id: `q_mus_tf_${skillId}`,
                  type: "recall_tf",
                  prompt: `True or False: Slow, deliberate practice with a metronome and hands-separate preparation accelerates long-term accuracy in "${skillName}".`,
                  options: ["True", "False"],
                  answer_key: "True",
                  rubric: null,
                  source_chunk_ids: [validChunkId],
                  skill_id: skillId,
                },
                {
                  id: `q_mus_applied_${skillId}`,
                  type: "applied",
                  prompt: `Describe your step-by-step practice routine for mastering "${skillName}" in a 15-minute daily session, including how you check for rhythmic evenness and physical relaxation.`,
                  options: null,
                  answer_key: null,
                  rubric: [
                    {
                      criterion: "Technical Accuracy & Hand Mechanics",
                      weight: 40,
                      description: `Identifies the core physical and musical mechanics required for ${skillName}.`,
                    },
                    {
                      criterion: "Rhythmic Control & Tempo Progression",
                      weight: 30,
                      description: "Explains how to use slow tempo, counting, or a metronome before increasing speed.",
                    },
                    {
                      criterion: "Focused 15-Minute Practice Structure",
                      weight: 30,
                      description: "Outlines a concrete, repeatable practice drill that isolates difficult measures.",
                    },
                  ],
                  source_chunk_ids: [validChunkId],
                  skill_id: skillId,
                },
              ],
            };
          }

          if (isArtSkill) {
            return {
              questions: [
                {
                  id: `q_art_mc_${skillId}`,
                  type: "recall_mc",
                  prompt: `When practicing "${skillName}", which foundational principle most strongly governs visual clarity and structure?`,
                  options: [
                    "Establishing accurate value relationships and big shapes before adding surface detail",
                    "Starting immediately with tiny highlights before blocking in the composition",
                    "Using pure unmixed black for every shadow regardless of lighting",
                    "Skipping proportion checks during the initial block-in stage",
                  ],
                  answer_key: 0,
                  rubric: null,
                  source_chunk_ids: [validChunkId],
                  skill_id: skillId,
                },
                {
                  id: `q_art_applied_${skillId}`,
                  type: "applied",
                  prompt: `Explain how you would set up and execute a 20-minute study focused on "${skillName}", including how you evaluate proportions, values, or color harmony.`,
                  options: null,
                  answer_key: null,
                  rubric: [
                    {
                      criterion: "Structural & Visual Foundation",
                      weight: 40,
                      description: `Demonstrates clear understanding of the core principles of ${skillName}.`,
                    },
                    {
                      criterion: "Value, Proportion, or Color Control",
                      weight: 30,
                      description: "Explains how to verify light/shadow hierarchy or spatial relationships.",
                    },
                    {
                      criterion: "Practical Studio Workflow",
                      weight: 30,
                      description: "Describes a progression from broad block-in to refined edges.",
                    },
                  ],
                  source_chunk_ids: [validChunkId],
                  skill_id: skillId,
                },
              ],
            };
          }

          // Dynamic questions for ANY arbitrary skill or subject
          return {
            questions: [
              {
                id: `q_dyn_mc_${skillId}`,
                type: "recall_mc",
                prompt: `Which approach best demonstrates mastery of the core concepts in "${skillName}"?`,
                options: [
                  `Applying the foundational principles of ${skillName} systematically and verifying outcomes against clear criteria`,
                  "Memorizing isolated terms without practicing real-world application",
                  "Skipping foundational prerequisites and jumping straight to edge cases",
                  "Relying on guesswork without reviewing feedback or reference guides",
                ],
                answer_key: 0,
                rubric: null,
                source_chunk_ids: [validChunkId],
                skill_id: skillId,
              },
              {
                id: `q_dyn_tf_${skillId}`,
                type: "recall_tf",
                prompt: `True or False: Breaking "${skillName}" into deliberate, verifiable practice steps improves long-term retention and transfer.`,
                options: ["True", "False"],
                answer_key: "True",
                rubric: null,
                source_chunk_ids: [validChunkId],
                skill_id: skillId,
              },
              {
                id: `q_dyn_applied_${skillId}`,
                type: "applied",
                prompt: `Walk through a concrete practical scenario where you apply "${skillName}". What are the key steps, common pitfalls to avoid, and how do you verify your result?`,
                options: null,
                answer_key: null,
                rubric: [
                  {
                    criterion: `Core Principles of ${skillName}`,
                    weight: 40,
                    description: `Accurately explains the primary concepts and mechanics of ${skillName}.`,
                  },
                  {
                    criterion: "Practical Application & Execution",
                    weight: 30,
                    description: "Provides a concrete, realistic walkthrough or example scenario.",
                  },
                  {
                    criterion: "Verification & Pitfall Awareness",
                    weight: 30,
                    description: "Identifies common mistakes and how to validate quality.",
                  },
                ],
                source_chunk_ids: [validChunkId],
                skill_id: skillId,
              },
            ],
          };
        }

        return {
          questions: [
            {
              id: "q_sql_01",
              type: "recall_mc",
              prompt: "Which clause filters rows before aggregation in SQL?",
              options: ["WHERE", "HAVING", "ORDER BY", "GROUP BY"],
              answer_key: 0,
              rubric: null,
              source_chunk_ids: [validChunkId],
              skill_id: skillId,
            },
            {
              id: "q_sql_applied_01",
              type: "applied",
              prompt: "Explain when to use an INNER JOIN versus a LEFT JOIN in analytics queries.",
              options: null,
              answer_key: null,
              rubric: [
                {
                  criterion: "Explains INNER JOIN behavior",
                  weight: 40,
                  description: "Notes that only matching rows from both tables are retained.",
                },
                {
                  criterion: "Explains LEFT JOIN behavior",
                  weight: 30,
                  description: "Notes all left-table rows are preserved with NULLs for unmatched right.",
                },
                {
                  criterion: "Contrasts analytical use cases",
                  weight: 30,
                  description: "Provides realistic examples contrasting data loss vs NULL preservation.",
                },
              ],
              source_chunk_ids: [validChunkId],
              skill_id: skillId,
            },
          ],
        };
      }

      case "grade_applied": {
        const isLowConfidence =
          prompt.includes("low_confidence") || prompt.includes("low confidence");
        const isFail = prompt.includes("fail_grade");

        let parsedRubric: Array<{ criterion: string; weight: number; description: string }> | null = null;
        try {
          const rubricMatch = prompt.match(/Rubric:\s*(\[\s*\{[\s\S]*?\}\s*\])/);
          if (rubricMatch) {
            const arr = JSON.parse(rubricMatch[1]);
            if (Array.isArray(arr) && arr.length > 0 && arr[0].criterion) {
              parsedRubric = arr;
            }
          }
        } catch {
          // fallback to default rubric
        }

        const activeRubric = parsedRubric || [
          {
            criterion: "Explains INNER JOIN behavior",
            weight: 40,
            description: "Notes that only matching rows from both tables are retained.",
          },
          {
            criterion: "Explains LEFT JOIN behavior",
            weight: 30,
            description: "Notes all left-table rows are preserved with NULLs for unmatched right.",
          },
          {
            criterion: "Contrasts analytical use cases",
            weight: 30,
            description: "Provides realistic examples contrasting data loss vs NULL preservation.",
          },
        ];

        return {
          criterion_scores: activeRubric.map((r, idx) => ({
            criterion: r.criterion,
            score: isFail ? (idx === 1 ? 1 : 0) : idx === activeRubric.length - 1 ? 1 : 2,
            max_score: 2,
            feedback: isFail
              ? `Needs deeper coverage of ${r.criterion.toLowerCase()}.`
              : `Demonstrates solid grasp of ${r.criterion.toLowerCase()}.`,
          })),
          total: isFail ? 40 : 85,
          verdict: isFail ? "fail" : "pass",
          feedback: {
            summary: isFail
              ? "Your response needs more specific detail across the rubric criteria."
              : "Clear, well-structured explanation that addresses the core criteria effectively.",
            strengths: [
              `Good foundational understanding of ${activeRubric[0]?.criterion || "core concepts"}.`,
            ],
            improvements: [
              `Expand with a concrete step-by-step example for ${activeRubric[activeRubric.length - 1]?.criterion || "applied edge cases"}.`,
            ],
          },
          confidence: isLowConfidence ? 0.45 : 0.95,
        };
      }

      case "answer_question": {
        let chunkIds: string[] = [];
        try {
          const m = prompt.match(/Retrieved Chunks:\s*(\[\s*\{[\s\S]*?\}\s*\])/);
          if (m) {
            const parsed = JSON.parse(m[1]);
            chunkIds = parsed.map((c: any) => c.id).filter(Boolean);
          }
        } catch {
          // fallback
        }

        const isGeneral =
          prompt.toLowerCase().includes("unrelated") ||
          prompt.toLowerCase().includes("general knowledge") ||
          prompt.includes("Retrieved Chunks:\n[]") ||
          prompt.includes('"chunks": []') ||
          chunkIds.length === 0;

        if (isGeneral) {
          const questionMatch = prompt.match(/Learner Question:\s*([^\n]+)/i);
          const skillCtxMatch = prompt.match(/Skill Context:\s*([^\n]+)/i);
          const qText = questionMatch ? questionMatch[1].trim() : "";
          const skillCtx = skillCtxMatch ? skillCtxMatch[1].trim() : "General";
          const combinedLower = `${qText} ${skillCtx}`.toLowerCase();

          let domainExplanation = "";
          if (/\b(piano|music|chord|scale|clef|rhythm|pedal|arpeggio|note|octave|tempo|key)\b/i.test(combinedLower)) {
            domainExplanation = `Regarding "${qText}" (${skillCtx}): In piano and music theory, start by establishing relaxed hand alignment and identifying the underlying key signature and rhythmic pulse. Practice the pattern hands separately at a slow, steady tempo (60-72 BPM) before combining hands, listening closely for even tone, clean voice leading between chords, and precise damper pedal changes.`;
          } else if (/\b(art|paint|draw|color|sketch|value|brush|perspective|canvas)\b/i.test(combinedLower)) {
            domainExplanation = `Regarding "${qText}" (${skillCtx}): In visual arts and painting, always establish big spatial proportions and a clear 3-value hierarchy (light, midtone, shadow) before rendering fine details or secondary color glazes. Squinting at your reference helps simplify complex forms into cohesive value shapes.`;
          } else if (/\b(health|clinical|biostatistics|regression|survival|trial|p-value)\b/i.test(combinedLower)) {
            domainExplanation = `Regarding "${qText}" (${skillCtx}): In biostatistics and clinical research, ensure you distinguish between sample point estimates and population parameters using confidence intervals, verify model assumptions (such as proportional hazards or linearity of log-odds), and account for potential confounders.`;
          } else if (qText) {
            domainExplanation = `Regarding "${qText}"${skillCtx !== "General" ? ` in the context of ${skillCtx}` : ""}: Focus first on the core mental model and foundational rules, then break the skill into a repeatable 15-minute deliberate practice drill. Verify your understanding by testing edge cases and applying the concept to a concrete example.`;
          } else {
            domainExplanation = "This concept is governed by foundational domain principles, structured deliberate practice, and active recall verification.";
          }

          return {
            answer: `General knowledge: ${domainExplanation} Note: This explanation is based on general domain knowledge rather than your uploaded materials.`,
            cited_chunk_ids: [],
            general_knowledge: true,
          };
        }

        return {
          answer:
            "In SQL, the WHERE clause filters rows before grouping occurs, whereas HAVING filters groups after aggregation.",
          cited_chunk_ids: chunkIds.length > 0 ? [chunkIds[0]] : ["chunk_sql_01"],
          general_knowledge: false,
        };
      }

      case "explain_level": {
        const isSimpler = prompt.toLowerCase().includes("simpler") || prompt.toLowerCase().includes("eli5");
        const isTechnical = prompt.toLowerCase().includes("more_technical") || prompt.toLowerCase().includes("technical");
        const isExample = prompt.toLowerCase().includes("with_example") || prompt.toLowerCase().includes("example");
        const priorMatch = prompt.match(/Prior Explanation:\s*([\s\S]+)$/i);
        const priorText = priorMatch ? priorMatch[1].trim() : "";
        const isSqlPrior = /\b(where|having|sql|select|join)\b/i.test(priorText) || !priorText;

        if (!isSqlPrior) {
          if (isSimpler) {
            return {
              explanation:
                "In simple terms: master the slow, basic building blocks first so your brain and muscle memory can handle the full pattern effortlessly without tension.",
            };
          }
          if (isTechnical) {
            return {
              explanation:
                "From a technical standpoint, isolating sub-skills reduces cognitive load in working memory, allowing myelination of motor/conceptual pathways before integrating multi-variable coordination.",
            };
          }
          if (isExample) {
            return {
              explanation:
                "Concrete example: Spend 5 minutes on isolated fundamentals at 60% speed, 5 minutes connecting two transitions, and 5 minutes applying the pattern in context without stopping.",
            };
          }
        }

        if (isSimpler) {
          return {
            explanation:
              "Think of WHERE as a bouncer at the door checking individual tickets, and HAVING as judging the final groups inside.",
          };
        }
        if (isTechnical) {
          return {
            explanation:
              "In relational algebra query planning, WHERE executes relational selection (σ) prior to hash aggregate grouping (γ), while HAVING applies post-aggregation residual filter expressions.",
          };
        }
        if (isExample) {
          return {
            explanation:
              "For example: SELECT department, COUNT(*) FROM employees WHERE salary > 50000 GROUP BY department HAVING COUNT(*) > 5;",
          };
        }
        return {
          explanation: "Here is an explanation adapted to your requested cognitive style.",
        };
      }

      case "weekly_summary": {
        const includesJournal = prompt.includes("Journal") || prompt.includes("journal");
        return {
          summary: includesJournal
            ? "You completed 4 study sessions this week (6.4 hours) and reflected in your journal about mastering SQL query planning."
            : "You completed 4 study sessions this week, totaling 6.4 hours. Both SQL fundamentals and joins quizzes were passed.",
        };
      }

      default:
        return { result: "ok" };
    }
  }
}
