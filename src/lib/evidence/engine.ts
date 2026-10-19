import {
  AttemptRecord,
  EvidenceEvaluationResult,
  EvidenceLevel,
  SkillEvidenceInput,
  SkillStatus,
} from "./types";

export function getEvidenceLabel(level: EvidenceLevel): string {
  switch (level) {
    case 0:
      return "Self-rated";
    case 1:
      return "Quiz passed";
    case 2:
      return "Applied, graded";
    case 3:
      return "Artifact checked";
    default:
      return "Self-rated";
  }
}

export interface EvaluateEvidenceOptions {
  now?: Date;
  reviewDueAndMissed?: boolean;
  hasExistingReview?: boolean;
}

/**
 * Pure function that evaluates the evidence level and mastery status
 * for a skill based on its verification type and recorded attempts.
 *
 * Implements PRD 6.1 - 6.3 exactly.
 */
export function evaluateEvidence(
  skill: SkillEvidenceInput,
  attempts: AttemptRecord[],
  options: EvaluateEvidenceOptions = {}
): EvidenceEvaluationResult {
  const now = options.now || new Date();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  // Rule: Verification type 'self' NEVER verifies.
  // Stays E0 with a "Self-rated" label.
  if (skill.verification_type === "self") {
    let status: SkillStatus = "not_started";
    if (attempts.length > 0) {
      status = "practising";
    } else if (skill.has_started_learning || skill.status === "learning") {
      status = "learning";
    }

    return {
      evidenceLevel: 0,
      status,
      verifiedAt: null,
      isVerified: false,
      evidenceLabel: getEvidenceLabel(0),
      shouldCreateReview: false,
    };
  }

  // Calculate highest evidence level from valid, non-pending, non-review attempts
  let highestLevel: EvidenceLevel = 0;
  let latestPassingAttemptDate: Date | null = null;

  for (const attempt of attempts) {
    // If attempt needs user review, pending, or submitted, it awards NO evidence
    if (
      attempt.status === "needs_your_review" ||
      attempt.status === "pending_grade" ||
      attempt.status === "submitted"
    ) {
      continue;
    }

    const grade = attempt.current_grade;
    if (!grade || !grade.is_current) {
      continue;
    }

    // Must be a passing verdict (total >= 70)
    if (grade.verdict !== "pass") {
      continue;
    }

    // Source 'self' NEVER counts as E2 or verified evidence
    if (grade.source === "self") {
      continue;
    }

    let awardedLevel: EvidenceLevel = 0;

    if (attempt.question_type === "recall_mc" || attempt.question_type === "recall_tf") {
      // Recall passed awards E1
      awardedLevel = 1;
    } else if (attempt.question_type === "applied") {
      // Applied passed awards E2
      awardedLevel = 2;
    } else if (attempt.question_type === "artifact") {
      // Artifact answers:
      // Only the "Confirm you ran it and it matched" tick grants E3.
      // E2 accepted if the artifact cannot be checked / unticked.
      if (attempt.user_confirmed_run === true) {
        awardedLevel = 3;
      } else {
        awardedLevel = 2;
      }
    }

    if (awardedLevel > highestLevel) {
      highestLevel = awardedLevel;
    }

    if (attempt.created_at) {
      const d = new Date(attempt.created_at);
      if (!latestPassingAttemptDate || d > latestPassingAttemptDate) {
        latestPassingAttemptDate = d;
      }
    }
  }

  // Check verification requirement per PRD 6.3:
  // - recall: E1 is sufficient to verify
  // - applied: E2 required
  // - artifact: E3 preferred, E2 accepted if the artifact cannot be checked
  let thresholdMet = false;
  if (skill.verification_type === "recall" && highestLevel >= 1) {
    thresholdMet = true;
  } else if (skill.verification_type === "applied" && highestLevel >= 2) {
    thresholdMet = true;
  } else if (skill.verification_type === "artifact" && highestLevel >= 2) {
    thresholdMet = true;
  }

  // Status transitions per PRD 6.2:
  // not_started -> learning (any plan item started) -> practising (any quiz or artifact attempted)
  // -> verified (evidence threshold met) -> needs_review (review due and missed, or verified > 30 days ago without review)
  let status: SkillStatus = "not_started";
  let verifiedAt = skill.verified_at || null;
  let isVerified = false;

  if (thresholdMet) {
    if (!verifiedAt) {
      verifiedAt = latestPassingAttemptDate
        ? latestPassingAttemptDate.toISOString()
        : now.toISOString();
    }

    // Check 30-day expiry
    const verifiedDate = new Date(verifiedAt);
    const isExpired = now.getTime() - verifiedDate.getTime() > thirtyDaysMs;

    if (options.reviewDueAndMissed || isExpired) {
      status = "needs_review";
      isVerified = false;
    } else {
      status = "verified";
      isVerified = true;
    }
  } else {
    verifiedAt = null;
    isVerified = false;
    if (attempts.length > 0) {
      status = "practising";
    } else if (skill.has_started_learning || skill.status === "learning") {
      status = "learning";
    } else {
      status = "not_started";
    }
  }

  const shouldCreateReview = isVerified && !options.hasExistingReview;

  return {
    evidenceLevel: highestLevel,
    status,
    verifiedAt,
    isVerified,
    evidenceLabel: getEvidenceLabel(highestLevel),
    shouldCreateReview,
  };
}
