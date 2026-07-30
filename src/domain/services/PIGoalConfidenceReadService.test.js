import { describe, expect, it } from "vitest";
import { createGoalConfidenceRepository } from "../../data/repositories/GoalConfidenceRepository";
import { createPIGoalConfidenceContractFixture } from "../../fixtures/piGoalConfidenceAssessmentFixtures";
import { createPIGoalConfidenceAssessment } from "./PIGoalConfidenceAssessmentModel";
import { createPIGoalConfidenceReadService } from "./PIGoalConfidenceReadService";

function assessment({
  evidenceCutoff,
  generatedAt,
  score = 58,
} = {}) {
  return createPIGoalConfidenceAssessment(
    createPIGoalConfidenceContractFixture("increased", {
      evidenceCutoff,
      generatedAt,
      score: {
        current: score,
        prior: 44,
        movement: { direction: "increased", magnitude: "material" },
        priorScoreProvenance: {
          source: "controlled_reconciliation_seed",
        },
      },
    })
  );
}

function historyRecord(value, suffix) {
  return {
    id: `history-${suffix}`,
    goalId: value.goalId,
    phaseId: value.phaseId,
    assessmentId: value.id,
    assessment: value,
  };
}

describe("PI Goal confidence temporal reads", () => {
  it("selects the latest canonical assessment fully available at the cutoff", () => {
    const eligible = assessment({
      evidenceCutoff: "2026-07-26T06:59:59.999Z",
      generatedAt: "2026-07-26T17:22:00.000Z",
    });
    const future = assessment({
      evidenceCutoff: "2026-07-30T06:59:59.999Z",
      generatedAt: "2026-07-30T17:22:00.000Z",
      score: 60,
    });
    const repository = createGoalConfidenceRepository({
      history: [
        historyRecord(future, "future"),
        historyRecord(eligible, "eligible"),
      ],
    });

    expect(createPIGoalConfidenceReadService({ repository })
      .getGoalConfidenceAssessmentAtOrBefore({
        goalId: eligible.goalId,
        phaseId: eligible.phaseId,
        cutoff: "2026-07-29T23:59:59.999Z",
      })).toMatchObject({
        assessment: { id: eligible.id, score: { current: 58 } },
        historyRecordId: "history-eligible",
        source: "canonical_pi_history_at_or_before",
        selectedAtOrBefore: "2026-07-29T23:59:59.999Z",
      });
  });

  it("returns unavailable instead of using a future, mismatched, or invalid assessment", () => {
    const future = assessment({
      evidenceCutoff: "2026-07-30T06:59:59.999Z",
      generatedAt: "2026-07-30T17:22:00.000Z",
    });
    const repository = createGoalConfidenceRepository({
      history: [
        historyRecord(future, "future"),
        {
          ...historyRecord(future, "invalid"),
          assessment: { ...future, goalId: "other-goal" },
        },
      ],
    });

    expect(createPIGoalConfidenceReadService({ repository })
      .getGoalConfidenceAssessmentAtOrBefore({
        goalId: future.goalId,
        phaseId: future.phaseId,
        cutoff: "2026-07-29T23:59:59.999Z",
      })).toBeNull();
  });
});
