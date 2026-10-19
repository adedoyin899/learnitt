import { describe, expect, it } from "vitest";
import { evaluateEvidence, getEvidenceLabel } from "@/lib/evidence/engine";
import { AttemptRecord, SkillEvidenceInput } from "@/lib/evidence/types";

describe("Evidence Engine (PRD Section 6 Table of Cases)", () => {
  it("returns correct plain labels for evidence levels E0-E3", () => {
    expect(getEvidenceLabel(0)).toBe("Self-rated");
    expect(getEvidenceLabel(1)).toBe("Quiz passed");
    expect(getEvidenceLabel(2)).toBe("Applied, graded");
    expect(getEvidenceLabel(3)).toBe("Artifact checked");
  });

  // PRD 6.3: Verification type 'self' never verifies
  describe("Verification type 'self'", () => {
    it("never verifies and stays E0 even with passing attempts or grades", () => {
      const skill: SkillEvidenceInput = {
        id: "sk_self",
        verification_type: "self",
        status: "not_started",
        evidence_level: 0,
      };

      const attempts: AttemptRecord[] = [
        {
          id: "att_1",
          question_id: "q_1",
          question_type: "applied",
          status: "graded",
          current_grade: {
            id: "gr_1",
            attempt_id: "att_1",
            source: "self",
            total: 100,
            verdict: "pass",
            is_current: true,
          },
        },
      ];

      const result = evaluateEvidence(skill, attempts);
      expect(result.isVerified).toBe(false);
      expect(result.evidenceLevel).toBe(0);
      expect(result.evidenceLabel).toBe("Self-rated");
      expect(result.status).toBe("practising");
      expect(result.shouldCreateReview).toBe(false);
    });
  });

  // PRD 6.3: Verification type 'recall' - E1 is sufficient to verify
  describe("Verification type 'recall'", () => {
    const skill: SkillEvidenceInput = {
      id: "sk_recall",
      verification_type: "recall",
      status: "not_started",
      evidence_level: 0,
    };

    it("verifies skill at E1 with passing recall attempt", () => {
      const attempts: AttemptRecord[] = [
        {
          id: "att_mc_1",
          question_id: "q_mc",
          question_type: "recall_mc",
          status: "graded",
          current_grade: {
            id: "gr_mc_1",
            attempt_id: "att_mc_1",
            source: "mc_auto",
            total: 100,
            verdict: "pass",
            is_current: true,
          },
        },
      ];

      const result = evaluateEvidence(skill, attempts);
      expect(result.isVerified).toBe(true);
      expect(result.evidenceLevel).toBe(1);
      expect(result.evidenceLabel).toBe("Quiz passed");
      expect(result.status).toBe("verified");
      expect(result.shouldCreateReview).toBe(true);
    });

    it("does not verify with failing recall attempt", () => {
      const attempts: AttemptRecord[] = [
        {
          id: "att_mc_2",
          question_id: "q_mc",
          question_type: "recall_mc",
          status: "graded",
          current_grade: {
            id: "gr_mc_2",
            attempt_id: "att_mc_2",
            source: "mc_auto",
            total: 0,
            verdict: "fail",
            is_current: true,
          },
        },
      ];

      const result = evaluateEvidence(skill, attempts);
      expect(result.isVerified).toBe(false);
      expect(result.evidenceLevel).toBe(0);
      expect(result.status).toBe("practising");
    });
  });

  // PRD 6.3: Verification type 'applied' - E2 required
  describe("Verification type 'applied'", () => {
    const skill: SkillEvidenceInput = {
      id: "sk_applied",
      verification_type: "applied",
      status: "not_started",
      evidence_level: 0,
    };

    it("verifies at E2 when AI grade is 70+ and confidence >= 0.6", () => {
      const attempts: AttemptRecord[] = [
        {
          id: "att_app_1",
          question_id: "q_app",
          question_type: "applied",
          status: "graded",
          current_grade: {
            id: "gr_app_1",
            attempt_id: "att_app_1",
            source: "ai",
            total: 85,
            verdict: "pass",
            confidence: 0.9,
            is_current: true,
          },
        },
      ];

      const result = evaluateEvidence(skill, attempts);
      expect(result.isVerified).toBe(true);
      expect(result.evidenceLevel).toBe(2);
      expect(result.evidenceLabel).toBe("Applied, graded");
      expect(result.status).toBe("verified");
    });

    it("does NOT verify if only recall passed (E1 < E2 required)", () => {
      const attempts: AttemptRecord[] = [
        {
          id: "att_mc_only",
          question_id: "q_mc",
          question_type: "recall_mc",
          status: "graded",
          current_grade: {
            id: "gr_mc",
            attempt_id: "att_mc_only",
            source: "mc_auto",
            total: 100,
            verdict: "pass",
            is_current: true,
          },
        },
      ];

      const result = evaluateEvidence(skill, attempts);
      expect(result.isVerified).toBe(false);
      expect(result.evidenceLevel).toBe(1); // Achieved E1
      expect(result.evidenceLabel).toBe("Quiz passed");
      expect(result.status).toBe("practising");
    });

    it("awards NO evidence when attempt is needs_your_review (confidence < 0.6)", () => {
      const attempts: AttemptRecord[] = [
        {
          id: "att_low_conf",
          question_id: "q_app",
          question_type: "applied",
          status: "needs_your_review",
          current_grade: {
            id: "gr_low_conf",
            attempt_id: "att_low_conf",
            source: "ai",
            total: 90,
            verdict: "pass",
            confidence: 0.5,
            is_current: true,
          },
        },
      ];

      const result = evaluateEvidence(skill, attempts);
      expect(result.isVerified).toBe(false);
      expect(result.evidenceLevel).toBe(0);
      expect(result.status).toBe("practising");
    });

    it("source 'self' on applied question never counts as E2", () => {
      const attempts: AttemptRecord[] = [
        {
          id: "att_self_grade",
          question_id: "q_app",
          question_type: "applied",
          status: "graded",
          current_grade: {
            id: "gr_self",
            attempt_id: "att_self_grade",
            source: "self",
            total: 95,
            verdict: "pass",
            is_current: true,
          },
        },
      ];

      const result = evaluateEvidence(skill, attempts);
      expect(result.isVerified).toBe(false);
      expect(result.evidenceLevel).toBe(0);
      expect(result.status).toBe("practising");
    });

    it("user override with pass awards E2 and verifies", () => {
      const attempts: AttemptRecord[] = [
        {
          id: "att_overridden",
          question_id: "q_app",
          question_type: "applied",
          status: "graded",
          current_grade: {
            id: "gr_override",
            attempt_id: "att_overridden",
            source: "user_override",
            total: 75,
            verdict: "pass",
            override_reason: "Answer was actually valid",
            is_current: true,
          },
        },
      ];

      const result = evaluateEvidence(skill, attempts);
      expect(result.isVerified).toBe(true);
      expect(result.evidenceLevel).toBe(2);
      expect(result.status).toBe("verified");
    });
  });

  // PRD 6.3 & Prompt 7: Artifact answers
  describe("Verification type 'artifact'", () => {
    const skill: SkillEvidenceInput = {
      id: "sk_artifact",
      verification_type: "artifact",
      status: "not_started",
      evidence_level: 0,
    };

    it("grants E3 ONLY when user confirms running it ('Confirm you ran it and it matched')", () => {
      const attempts: AttemptRecord[] = [
        {
          id: "att_art_1",
          question_id: "q_art",
          question_type: "artifact",
          status: "graded",
          user_confirmed_run: true, // User ticked "Confirm you ran it and it matched"
          current_grade: {
            id: "gr_art_1",
            attempt_id: "att_art_1",
            source: "ai",
            total: 90,
            verdict: "pass",
            confidence: 0.95,
            is_current: true,
          },
        },
      ];

      const result = evaluateEvidence(skill, attempts);
      expect(result.isVerified).toBe(true);
      expect(result.evidenceLevel).toBe(3);
      expect(result.evidenceLabel).toBe("Artifact checked");
      expect(result.status).toBe("verified");
    });

    it("awards E2 (not E3) when artifact is passed without the confirmation tick", () => {
      const attempts: AttemptRecord[] = [
        {
          id: "att_art_2",
          question_id: "q_art",
          question_type: "artifact",
          status: "graded",
          user_confirmed_run: false, // NOT confirmed
          current_grade: {
            id: "gr_art_2",
            attempt_id: "att_art_2",
            source: "ai",
            total: 80,
            verdict: "pass",
            confidence: 0.95,
            is_current: true,
          },
        },
      ];

      const result = evaluateEvidence(skill, attempts);
      // E2 is accepted for artifact if not checked per PRD 6.3
      expect(result.isVerified).toBe(true);
      expect(result.evidenceLevel).toBe(2); // Capped at E2!
      expect(result.evidenceLabel).toBe("Applied, graded");
      expect(result.status).toBe("verified");
    });
  });

  // PRD 6.2: 30-day expiry & review due
  describe("Skill status transitions & 30-day review expiry", () => {
    it("transitions from not_started to learning when plan item started", () => {
      const skill: SkillEvidenceInput = {
        id: "sk_trans",
        verification_type: "applied",
        status: "not_started",
        evidence_level: 0,
        has_started_learning: true,
      };

      const result = evaluateEvidence(skill, []);
      expect(result.status).toBe("learning");
    });

    it("becomes needs_review if verified more than 30 days ago", () => {
      const now = new Date("2026-11-01T12:00:00Z");
      const thirtyFiveDaysAgo = new Date("2026-09-27T12:00:00Z").toISOString();

      const skill: SkillEvidenceInput = {
        id: "sk_exp",
        verification_type: "recall",
        status: "verified",
        evidence_level: 1,
        verified_at: thirtyFiveDaysAgo,
      };

      const attempts: AttemptRecord[] = [
        {
          id: "att_old",
          question_id: "q_rec",
          question_type: "recall_mc",
          status: "graded",
          created_at: thirtyFiveDaysAgo,
          current_grade: {
            id: "gr_old",
            attempt_id: "att_old",
            source: "mc_auto",
            total: 100,
            verdict: "pass",
            is_current: true,
          },
        },
      ];

      const result = evaluateEvidence(skill, attempts, { now });
      expect(result.status).toBe("needs_review");
      expect(result.isVerified).toBe(false);
    });

    it("becomes needs_review if review is due and missed", () => {
      const now = new Date("2026-10-20T12:00:00Z");
      const twoDaysAgo = new Date("2026-10-18T12:00:00Z").toISOString();

      const skill: SkillEvidenceInput = {
        id: "sk_rev_missed",
        verification_type: "applied",
        status: "verified",
        evidence_level: 2,
        verified_at: twoDaysAgo,
      };

      const attempts: AttemptRecord[] = [
        {
          id: "att_app",
          question_id: "q_app",
          question_type: "applied",
          status: "graded",
          created_at: twoDaysAgo,
          current_grade: {
            id: "gr_app",
            attempt_id: "att_app",
            source: "ai",
            total: 85,
            verdict: "pass",
            confidence: 0.9,
            is_current: true,
          },
        },
      ];

      const result = evaluateEvidence(skill, attempts, {
        now,
        reviewDueAndMissed: true,
      });

      expect(result.status).toBe("needs_review");
      expect(result.isVerified).toBe(false);
    });
  });
});
