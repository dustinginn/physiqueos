import { describe, expect, it } from "vitest";
import {
  OPERATING_PLAN_ENERGY_PHASE_HISTORY_SCHEMA_VERSION,
  resolveOperatingPlanEnergyPhaseHistory,
} from "./OperatingPlanEnergyPhaseHistoryService.js";

const ownerUserId = "founder";
const goal = {
  id: "goal-build",
  userId: ownerUserId,
  status: "active",
  currentPhaseId: "phase-2",
  phases: [
    {
      id: "phase-1",
      name: "Establish Maintenance",
      order: 0,
      status: "completed",
      startedAt: "2026-07-01",
      completedAt: "2026-08-01",
    },
    {
      id: "phase-2",
      name: "Lean Mass Build",
      order: 1,
      status: "active",
      startedAt: "2026-08-01",
      completedAt: null,
    },
  ],
};
const protocol = {
  id: "energy",
  userId: ownerUserId,
  protocolType: "energy",
  status: "active",
  relatedGoalIds: [goal.id],
  effectiveStrategy: {
    caloricIntakeTarget: { value: 9999, unit: "kcal/day" },
    activityExpenditureTarget: { value: 9998, unit: "kcal/day" },
  },
};
const revision = (overrides = {}) => ({
  id: "energy-v1",
  protocolId: protocol.id,
  versionNumber: 1,
  status: "superseded",
  phaseId: "phase-1",
  strategyId: "phase-strategy-1",
  effectiveAt: "2026-07-01",
  endedAt: "2026-08-01",
  goalLinks: [{ goalId: goal.id, relationship: "supports" }],
  confirmation: { authority: "authorized_phase_review" },
  change: {
    reviewedChanges: {
      caloricIntakeTarget: { value: 2450, unit: "kcal/day" },
      activityExpenditureTarget: { value: 500, unit: "kcal/day" },
    },
  },
  ...overrides,
});

function project(overrides = {}) {
  return resolveOperatingPlanEnergyPhaseHistory({
    goal,
    protocols: [protocol],
    protocolVersions: [revision()],
    ownerUserId,
    ownerTimeZone: "America/Los_Angeles",
    ...overrides,
  });
}

describe("Operating Plan historical Energy phase projection", () => {
  it("publishes the additive schema and source-authentic target lineage", () => {
    expect(OPERATING_PLAN_ENERGY_PHASE_HISTORY_SCHEMA_VERSION)
      .toBe("operating_plan_energy_phase_history_v1");
    expect(project()).toEqual([{
      id: "phase-1",
      goalId: goal.id,
      phaseId: "phase-1",
      phaseName: "Establish Maintenance",
      phaseOrder: 1,
      phaseStatus: "completed",
      startedOn: "2026-07-01",
      endedOn: "2026-08-01",
      dateSemantics: "owner_local_calendar_date",
      timeZone: "America/Los_Angeles",
      availability: "available",
      absenceKind: null,
      reason: null,
      revisions: [{
        id: "energy-v1",
        protocolId: "energy",
        protocolVersionId: "energy-v1",
        protocolVersionNumber: 1,
        goalId: goal.id,
        phaseId: "phase-1",
        effectiveFrom: "2026-07-01",
        effectiveTo: "2026-08-01",
        dateSemantics: "owner_local_calendar_date",
        timeZone: "America/Los_Angeles",
        caloricIntakeTarget: { availability: "available", value: 2450, unit: "kcal/day" },
        activityExpenditureTarget: { availability: "available", value: 500, unit: "kcal/day" },
        provenance: {
          source: "canonical_protocol_version",
          phaseAttribution: "protocol_version.phaseId",
          goalAttribution: "protocol_version.goalLinks",
          targetAttribution: "protocol_version.change.reviewedChanges",
          strategyId: "phase-strategy-1",
          confirmationAuthority: "authorized_phase_review",
        },
      }],
    }]);
  });

  it("models multiple within-phase revisions with exact effective ranges", () => {
    const first = revision({ endedAt: "2026-07-15" });
    const second = revision({
      id: "energy-v2",
      versionNumber: 2,
      effectiveAt: "2026-07-15",
      change: { reviewedChanges: {
        caloricIntakeTarget: { value: 2550, unit: "kcal/day" },
        activityExpenditureTarget: { value: 525, unit: "kcal/day" },
      } },
    });
    const history = project({ protocolVersions: [second, first] });
    expect(history[0].revisions.map((item) => [
      item.protocolVersionId,
      item.effectiveFrom,
      item.effectiveTo,
      item.caloricIntakeTarget.value,
    ])).toEqual([
      ["energy-v1", "2026-07-01", "2026-07-15", 2450],
      ["energy-v2", "2026-07-15", "2026-08-01", 2550],
    ]);
  });

  it("keeps phase chronology but marks a missing historical revision unknown", () => {
    expect(project({ protocolVersions: [] })[0]).toMatchObject({
      startedOn: "2026-07-01",
      endedOn: "2026-08-01",
      availability: "unavailable",
      absenceKind: "unknown",
      reason: "no_authoritative_phase_strategy_revision",
      revisions: [],
    });
  });

  it("marks fields absent from a real immutable record as not recorded", () => {
    const history = project({ protocolVersions: [revision({
      change: { reviewedChanges: {
        caloricIntakeTarget: { value: 2450, unit: "kcal/day" },
      } },
    })] });
    expect(history[0]).toMatchObject({
      availability: "partial",
      absenceKind: "recorded_without_targets",
      revisions: [{
        caloricIntakeTarget: { availability: "available", value: 2450 },
        activityExpenditureTarget: { availability: "not_recorded", value: null, unit: null },
      }],
    });
  });

  it("withholds overlapping or same-day conflicting revisions", () => {
    const history = project({ protocolVersions: [
      revision({ endedAt: "2026-07-20" }),
      revision({ id: "energy-v2", versionNumber: 2, effectiveAt: "2026-07-15" }),
    ] });
    expect(history[0]).toMatchObject({
      availability: "untrusted",
      absenceKind: "source_untrusted",
      reason: "conflicting_effective_ranges",
      revisions: [],
    });
  });

  it("rejects wrong-Goal attribution even when the protocol root names the current Goal", () => {
    const history = project({ protocolVersions: [revision({
      goalLinks: [{ goalId: "another-goal", relationship: "supports" }],
    })] });
    expect(history[0]).toMatchObject({
      availability: "untrusted",
      reason: "goal_attribution_conflict",
      revisions: [],
    });
  });

  it("never copies the mutable current target into an old phase", () => {
    const history = project({ protocolVersions: [] });
    expect(JSON.stringify(history)).not.toMatch(/9999|9998/);
    expect(history[0].revisions).toEqual([]);
  });

  it("keeps a same-day phase transition as a non-overlapping exclusive boundary", () => {
    const history = project();
    expect(history[0].endedOn).toBe("2026-08-01");
    expect(history[0].revisions[0].effectiveTo).toBe("2026-08-01");
    expect(history).toHaveLength(1);
    expect(history.some((item) => item.phaseId === "phase-2")).toBe(false);
  });

  it("fails closed for another owner and for a Goal not supported by Energy", () => {
    expect(project({ ownerUserId: "other" })).toEqual([]);
    expect(project({ protocols: [{ ...protocol, relatedGoalIds: ["other-goal"] }] })[0])
      .toMatchObject({ availability: "unavailable", revisions: [] });
  });
});
