import { describe, expect, it } from "vitest";
import {
  applyRecurringBriefingPrecedence,
  createBriefingCadenceExecutionIdentity,
  createPIExecutionIdentity,
  resolveIntelligenceEvidenceCutoff,
} from "./IntelligenceLifecycleIdentityService";

describe("canonical intelligence lifecycle identity", () => {
  it("gives an exact PI retry the same business identity", () => {
    const input = {
      ownerUserId: "user_founder_001",
      publisherType: "weekly_briefing",
      goalId: "goal-build",
      phaseId: "phase-one",
      occurrenceId: "weekly-one",
      artifactId: "weekly-one",
      evidenceWindowId: "weekly:2026-08-23:2026-08-29:America/Los_Angeles",
      evidenceCutoff: "2026-08-30T06:59:59.999Z",
      idempotencyKey: "confidence_v2|weekly|weekly-one",
    };
    expect(createPIExecutionIdentity(input)).toBe(
      createPIExecutionIdentity(structuredClone(input))
    );
    expect(createPIExecutionIdentity({
      ...input,
      idempotencyKey: `${input.idempotencyKey}|revision|two`,
    })).not.toBe(createPIExecutionIdentity(input));
  });

  it("preserves the existing durable cadence occurrence identity", () => {
    expect(createBriefingCadenceExecutionIdentity({
      ownerUserId: "founder",
      cadenceKey: "weekly",
      expectedArtifactId: "weekly_briefing_2026-08-23_2026-08-29",
    })).toBe(
      "briefing-cadence:founder:weekly:weekly_briefing_2026-08-23_2026-08-29"
    );
  });

  it("lets Monthly suppress colliding lower-precedence recurring cadences", () => {
    const result = applyRecurringBriefingPrecedence([
      { cadence: "midweek", eligible: true, expectedArtifactId: "midweek" },
      { cadence: "weekly", eligible: false, expectedArtifactId: null },
      { cadence: "monthly", eligible: true, expectedArtifactId: "monthly" },
    ]);
    expect(result).toEqual([
      expect.objectContaining({
        cadence: "midweek",
        eligible: false,
        eligibilityReason: "superseded_by_monthly",
        supersededByArtifactId: "monthly",
      }),
      expect.objectContaining({ cadence: "weekly", eligible: false }),
      expect.objectContaining({ cadence: "monthly", eligible: true }),
    ]);
  });

  it("freezes date-only cutoffs at the end of the intended local day", () => {
    expect(resolveIntelligenceEvidenceCutoff({
      value: "2026-07-28",
      timeZone: "America/Los_Angeles",
    })).toBe("2026-07-29T06:59:59.999Z");
    expect(resolveIntelligenceEvidenceCutoff({
      value: "2026-12-28",
      timeZone: "America/Los_Angeles",
    })).toBe("2026-12-29T07:59:59.999Z");
  });
});
