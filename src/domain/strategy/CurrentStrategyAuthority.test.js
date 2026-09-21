import { describe, expect, it } from "vitest";
import authorityFixture from "../../fixtures/briefingFamilyV3/strategyAuthority.json";
import { resolveCommittedPhaseContext } from "../services/FounderPhaseCorrectionService.js";
import {
  CurrentStrategyOperatingState,
  resolveCurrentStrategyAuthority,
  resolveOperatingStateFromGoalPhase,
  resolveWeeklyActivityTargetKcal,
} from "./CurrentStrategyAuthority.js";

const { goal, phaseStrategy, protocols, protocolVersions } = authorityFixture;
const phase = resolveCommittedPhaseContext(goal, { asOf: "2026-09-19" }).activePhase;
const resolve = (overrides = {}) => resolveCurrentStrategyAuthority({
  goal, phase, phaseStrategies: [phaseStrategy], protocols, protocolVersions, ...overrides,
});

describe("current strategy authority (Sep 13–19 Founder records)", () => {
  it("resolves the active Build Lean Mass goal, Lean Mass Build phase and accepted strategy", () => {
    const authority = resolve();
    expect(authority.goalTitle).toBe("Build Lean Mass");
    expect(authority.phaseName).toBe("Lean Mass Build");
    expect(authority.phaseStatus).toBe("active");
    expect(authority.strategyRevisionId).toBe("phase_strategy|ba790d5efced3109354c8f54|v1");
    expect(authority.status).toBe("resolved");
  });

  it("carries the current Energy Strategy targets from the current protocol revision", () => {
    const { energyStrategy } = resolve();
    expect(energyStrategy.mode).toBe("Phase Execution");
    expect(energyStrategy.intakeTarget).toEqual({ value: 2500, unit: "kcal/day" });
    expect(energyStrategy.activityTarget).toEqual({ value: 800, unit: "kcal/day" });
    expect(energyStrategy.adjustmentAuthorization).toBe("user_required");
    expect(energyStrategy.automaticAdjustmentAllowed).toBe(false);
    expect(energyStrategy.intent).toBe("execute_user_authorized_phase_targets");
    expect(energyStrategy.protocolVersionNumber).toBe(2);
    expect(energyStrategy.confirmationAuthority).toBe("authorized_phase_review");
    expect(resolveWeeklyActivityTargetKcal(resolve())).toBe(5600);
  });

  it("carries the 8–9% body-fat guardrail from the phase strategy", () => {
    expect(resolve().bodyFatGuardrail).toMatchObject({
      minimum: 8, maximum: 9, unit: "%", source: "phase_strategy_guardrail_response",
    });
  });

  it("treats maintenance calibration as historical context only", () => {
    const authority = resolve();
    expect(authority.operatingState.value).toBe(CurrentStrategyOperatingState.PHASE_EXECUTION);
    expect(authority.historicalContext.openingApproach.value).toBe("calibration");
    expect(authority.historicalContext.maintenanceCalibrationIsCurrent).toBe(false);
    // The stale protocol display name is preserved in the record but never used.
    const energyProtocol = protocols.find((item) => item.category === "energy");
    expect(energyProtocol.name).toMatch(/Maintenance Calibration/);
    expect(JSON.stringify(authority.energyStrategy)).not.toMatch(/Maintenance Calibration/);
  });

  it("does not let the superseded v1 Energy revision override the current revision", () => {
    const onlyV1 = protocolVersions.map((item) => item.versionNumber === 2 ? { ...item, status: "superseded" } : item)
      .filter((item) => item.versionNumber !== 2 || true);
    const authority = resolve({ protocolVersions: onlyV1 });
    expect(authority.energyStrategy.mode).not.toBe("Maintenance Calibration");
    expect(authority.energyStrategy.protocolVersionId).toBeNull();
    expect(authority.energyStrategy.intakeTarget).toBeNull();
    expect(authority.diagnostics).toContain("energy_protocol_revision_unavailable");
  });

  it("reads a window with the revision in force at its evidence cutoff, not a later protocol change", () => {
    const energyProtocol = protocols.find((item) => item.category === "energy");
    const v2 = protocolVersions.find((item) => item.protocolId === energyProtocol.id && item.versionNumber === 2);
    const v3 = {
      ...v2, id: `${energyProtocol.id}_v3`, versionNumber: 3, effectiveAt: "2026-09-25T00:00:00.000Z",
      change: { ...v2.change, reviewedChanges: { ...v2.change.reviewedChanges, caloricIntakeTarget: { value: 2700, unit: "kcal/day" } } },
    };
    const versions = [...protocolVersions, v3];
    const protocol = { ...energyProtocol, currentVersionId: v3.id };
    const otherProtocols = protocols.map((item) => item.id === energyProtocol.id ? protocol : item);
    const atSep20 = resolve({ protocols: otherProtocols, protocolVersions: versions, evidenceCutoff: "2026-09-20T06:59:59.999Z" });
    expect(atSep20.energyStrategy.intakeTarget.value).toBe(2500);
    const atOct1 = resolve({ protocols: otherProtocols, protocolVersions: versions, evidenceCutoff: "2026-10-01T06:59:59.999Z" });
    expect(atOct1.energyStrategy.intakeTarget.value).toBe(2700);
  });

  it("prefers the Energy protocol bound to the accepted strategy over another active Energy protocol", () => {
    const energyProtocol = protocols.find((item) => item.category === "energy");
    const stray = { ...energyProtocol, id: "protocol_stray_energy", phaseStrategyId: "other_strategy", currentVersionId: "protocol_stray_energy_v9" };
    const strayVersion = {
      ...protocolVersions.find((item) => item.protocolId === energyProtocol.id && item.versionNumber === 2),
      id: "protocol_stray_energy_v9", protocolId: stray.id, versionNumber: 9, strategyId: undefined, phaseId: undefined,
      change: { reviewedChanges: { caloricIntakeTarget: { value: 3100, unit: "kcal/day" }, activityExpenditureTarget: { value: 300, unit: "kcal/day" } } },
    };
    const authority = resolve({ protocols: [...protocols, stray], protocolVersions: [...protocolVersions, strayVersion] });
    expect(authority.energyStrategy.intakeTarget.value).toBe(2500);
    expect(authority.energyStrategy.protocolId).toBe(energyProtocol.id);
  });

  it("does not resolve a strategy from a different phase", () => {
    const authority = resolve({ phaseStrategies: [{ ...phaseStrategy, phaseId: "some_other_phase" }] });
    expect(authority.phaseStrategy).toBeNull();
    expect(authority.diagnostics).toContain("phase_strategy_unavailable");
  });

  it("gives active-phase strategy precedence over openingApproach for surfaces without strategy records", () => {
    const state = resolveOperatingStateFromGoalPhase({ goal, phase });
    expect(state.value).toBe("phase_execution");
    expect(state.historicalOpeningApproach).toBe("calibration");
    const historical = resolveOperatingStateFromGoalPhase({
      goal: { ...goal, activePhaseStrategyId: null, timeline: { ...goal.timeline, activePhaseStrategyId: null } },
      phase,
    });
    expect(historical.source).toBe("legacy_opening_approach");
  });
});
