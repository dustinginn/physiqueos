import { describe, expect, it, vi } from "vitest";
import {
  createPICadenceGoalConfidencePreparationService,
} from "./PICadenceGoalConfidencePreparationService";

describe("PI cadence goal-confidence preparation", () => {
  it.each([
    ["midweek_assessment", "midweek_partial_window"],
    ["weekly_assessment", "weekly_closed_window"],
  ])("prepares %s without performing a persistence commit", async (
    triggerType, contextType
  ) => {
    const readService = {
      getGoalConfidenceSeries: vi.fn(() => ({
        canonicalSeriesExists: false,
        currentSnapshot: null,
        latestCanonicalAssessment: null,
        history: [],
        continuitySeed: null,
      })),
    };
    const result = await createPICadenceGoalConfidencePreparationService({
      readService,
      now: () => new Date("2026-07-26T17:00:00.000Z"),
    }).prepare(request(triggerType));

    expect(result).toMatchObject({
      status: "prepared_successor",
      assessment: { context: { type: contextType } },
      publicationCommand: { operation: "publish_initial" },
    });
    expect(result.publicationCommand.assessment.id).toBe(result.assessment.id);
    expect(readService.getGoalConfidenceSeries).toHaveBeenCalledOnce();
  });

  it("rejects non-cadence triggers before scoring", async () => {
    const readService = { getGoalConfidenceSeries: vi.fn() };
    const result = await createPICadenceGoalConfidencePreparationService({
      readService,
    }).prepare(request("photo_event"));
    expect(result).toEqual({
      status: "not_eligible", reason: "unsupported_cadence_trigger",
    });
    expect(readService.getGoalConfidenceSeries).not.toHaveBeenCalled();
  });
});

function request(triggerType) {
  const cadence = triggerType === "weekly_assessment" ? "weekly" : "midweek";
  return {
    triggerType,
    occurrenceId: `${cadence}_2026_07_25`,
    publicationReason: `Future ${cadence} cadence.`,
    goalContext: {
      goalId: "goal_build_lean_mass",
      semanticGoalType: "build_lean_mass",
    },
    phaseContext: {
      phaseId: "phase_establish_maintenance",
      semanticPhaseType: "establish_maintenance",
    },
    operatingState: "calibration",
    assessmentContext: {
      cadence, evidenceWindowId: `${cadence}_window`,
    },
    evidenceWindow: { id: `${cadence}_window` },
    evidenceCutoff: "2026-07-26T06:59:59.999Z",
    generatedAt: "2026-07-26T17:00:00.000Z",
    piVersion: "pi_v3",
    expectedRevision: 7,
    expectedSemanticDigest: "digest",
    expectedCurrentSnapshot: null,
    preparedPIReasoning: {
      publicationEligible: true,
      semanticChange: true,
      piReasoningFingerprint: `sha256_${"a".repeat(64)}`,
      domainStates: {
        energy: { status: "near_maintenance" },
        training: { status: "broad_constructive" },
        weight: { status: "stable" },
      },
      evidenceCompleteness: { overall: "complete" },
      reasoning: {},
    },
  };
}
