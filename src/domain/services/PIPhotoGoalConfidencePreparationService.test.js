import { describe, expect, it, vi } from "vitest";
import {
  createPIPhotoGoalConfidencePreparationService,
} from "./PIPhotoGoalConfidencePreparationService";

describe("PI Photo goal-confidence preparation", () => {
  it.each(["stable", "softening", "inconclusive", "low_quality"])(
    "prepares %s visual semantics without persistence", async (status) => {
      const readService = { getGoalConfidenceSeries: vi.fn(() => ({
        canonicalSeriesExists: false,
        currentSnapshot: null,
        latestCanonicalAssessment: null,
        history: [],
        continuitySeed: null,
      })) };
      const result = await createPIPhotoGoalConfidencePreparationService({
        readService,
        now: () => new Date("2026-08-08T18:00:00.000Z"),
      }).prepare(request(status));
      expect(result).toMatchObject({
        status: "prepared_successor",
        assessment: {
          context: { type: "photo_event" },
          score: { movement: { direction: "initial" } },
        },
        publicationCommand: { operation: "publish_initial" },
        visualContributor: { domain: "photos" },
      });
      expect(readService.getGoalConfidenceSeries).toHaveBeenCalledOnce();
    }
  );

  it("rejects non-Photo triggers before scoring", async () => {
    const readService = { getGoalConfidenceSeries: vi.fn() };
    const result = await createPIPhotoGoalConfidencePreparationService({
      readService,
    }).prepare({ ...request("stable"), triggerType: "weekly_assessment" });
    expect(result).toEqual({
      status: "not_eligible", reason: "unsupported_photo_trigger",
    });
    expect(readService.getGoalConfidenceSeries).not.toHaveBeenCalled();
  });
});

function request(status) {
  return {
    triggerType: "photo_event",
    occurrenceId: "event_briefing_progress_photo_future",
    publicationReason: "Future Photo Event.",
    goalContext: {
      goalId: "goal_build_lean_mass",
      semanticGoalType: "build_lean_mass",
    },
    phaseContext: {
      phaseId: "phase_establish_maintenance",
      semanticPhaseType: "establish_maintenance",
    },
    operatingState: "calibration",
    assessmentContext: { eventId: "event_briefing_progress_photo_future" },
    evidenceCutoff: "2026-08-08T23:59:59.999Z",
    generatedAt: "2026-08-08T18:00:00.000Z",
    piVersion: "pi_v3",
    expectedRevision: 7,
    expectedSemanticDigest: "digest",
    expectedCurrentSnapshot: null,
    preparedPIReasoning: {
      publicationEligible: true,
      semanticChange: true,
      piReasoningFingerprint: `sha256_${status.padEnd(64, "a").slice(0, 64)}`,
      domainStates: {
        photos: {
          status,
          canonicalEvidenceReferences: [{
            id: `photo_visual_${status}`, type: "photo_visual_authority",
          }],
        },
      },
      evidenceCompleteness: {
        overall: ["inconclusive", "low_quality"].includes(status)
          ? "partial" : "complete",
      },
      reasoning: {},
    },
  };
}
