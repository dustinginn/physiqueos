import { describe, expect, it, vi } from "vitest";
import {
  createPIDEXAGoalConfidencePreparationService,
} from "./PIDEXAGoalConfidencePreparationService";

describe("PI DEXA goal-confidence preparation", () => {
  it.each([
    ["confirming"],
    ["contradicting"],
    ["recent_baseline"],
  ])("prepares authoritative %s semantics without committing", async (status) => {
    const readService = {
      getGoalConfidenceSeries: vi.fn(() => ({
        canonicalSeriesExists: false,
        currentSnapshot: null,
        latestCanonicalAssessment: null,
        history: [],
        continuitySeed: null,
      })),
    };
    const result = await createPIDEXAGoalConfidencePreparationService({
      readService,
      now: () => new Date("2026-08-15T18:00:00.000Z"),
    }).prepare(request(status));
    expect(result).toMatchObject({
      status: "prepared_successor",
      assessment: {
        context: { type: "dexa_event" },
        score: { movement: { direction: "initial" } },
      },
      publicationCommand: { operation: "publish_initial" },
      authoritativeDEXAContributor: {
        domain: "dexa",
        strength: "authoritative",
      },
    });
  });

  it("rejects a non-DEXA trigger before reading confidence", async () => {
    const readService = { getGoalConfidenceSeries: vi.fn() };
    const result = await createPIDEXAGoalConfidencePreparationService({
      readService,
    }).prepare({ ...request("confirming"), triggerType: "weekly_assessment" });
    expect(result).toEqual({
      status: "not_eligible", reason: "unsupported_dexa_trigger",
    });
    expect(readService.getGoalConfidenceSeries).not.toHaveBeenCalled();
  });
});

function request(status) {
  return {
    triggerType: "dexa_event",
    occurrenceId: "dexa_event_august_15",
    publicationReason: "Future DEXA Event.",
    goalContext: {
      goalId: "goal_build_lean_mass",
      semanticGoalType: "build_lean_mass",
    },
    phaseContext: {
      phaseId: "phase_establish_maintenance",
      semanticPhaseType: "establish_maintenance",
    },
    operatingState: "calibration",
    assessmentContext: { eventId: "dexa_event_august_15" },
    evidenceCutoff: "2026-08-15T23:59:59.999Z",
    generatedAt: "2026-08-15T18:00:00.000Z",
    piVersion: "pi_v3",
    expectedRevision: 7,
    expectedSemanticDigest: "digest",
    expectedCurrentSnapshot: null,
    preparedPIReasoning: {
      publicationEligible: true,
      semanticChange: true,
      piReasoningFingerprint: `sha256_${status.padEnd(64, "a").slice(0, 64)}`,
      domainStates: {
        dexa: {
          status,
          authoritative: true,
          canonicalEvidenceReferences: [{
            id: `dexa_authority_${status}`, type: "dexa_authority",
          }],
        },
      },
      evidenceCompleteness: {
        overall: status === "recent_baseline" ? "partial" : "complete",
      },
      reasoning: {},
    },
  };
}
