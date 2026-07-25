import { describe, expect, it } from "vitest";
import { applyPIGoalContextToObservations, createPIGoalContext } from "./PIObservationGoalContextService";
import { createPhotoPIObservations } from "./PhotoPIObservationService";

describe("Photo PI observations", () => {
  it("creates neutral same-pose observations from explicit structured direction", () => {
    const observations = createPhotoPIObservations({ comparisons: [comparison()] });
    expect(observations.find((item) => item.kind === "photo_leanness_change")).toMatchObject({
      direction: "falling",
      confidence: { level: "moderate" },
      explanationData: {
        currentSessionId: "session-current",
        comparisonSessionId: "session-prior",
        poseId: "front-relaxed",
        comparisonQuality: "high",
      },
    });
    expect(observations.find((item) => item.kind === "photo_comparability").status).toBe("observed");
  });

  it.each([
    [{ comparisonPoseId: "back-relaxed" }, "pose_mismatch"],
    [{ comparisonContractionState: "flexed" }, "contraction_state_mismatch"],
    [{ comparisonBodyView: "rear" }, "body_view_mismatch"],
    [{ comparisonImageAvailable: false }, "comparison_image_unavailable"],
  ])("rejects non-comparable views conservatively", (change, limitation) => {
    const observations = createPhotoPIObservations({ comparisons: [{ ...comparison(), ...change }] });
    const comparability = observations.find((item) => item.kind === "photo_comparability");
    expect(comparability.status).toBe("insufficient_data");
    expect(comparability.confidence.limitations).toContain(limitation);
    expect(observations.some((item) => item.kind === "photo_leanness_change")).toBe(false);
  });

  it("reduces confidence for low comparability and raises it only with explicit repetition", () => {
    const low = createPhotoPIObservations({ comparisons: [{ ...comparison(), comparisonQuality: "low" }] });
    expect(low.find((item) => item.kind === "photo_leanness_change").confidence.level).toBe("low");
    const repeated = comparison();
    repeated.findings[0].repeatedDirectionCount = 2;
    expect(createPhotoPIObservations({ comparisons: [repeated] }).find((item) => item.kind === "photo_leanness_change").confidence.level).toBe("high");
  });

  it("suppresses duplicate session-pose comparisons deterministically", () => {
    const observations = createPhotoPIObservations({ comparisons: [comparison(), comparison()] });
    expect(observations.filter((item) => item.kind === "photo_leanness_change")).toHaveLength(1);
  });

  it("emits insufficient comparison without structured direction or prior evidence", () => {
    expect(createPhotoPIObservations().map((item) => item.kind)).toEqual(["photo_insufficient_comparison"]);
    const noFinding = comparison();
    noFinding.findings = [];
    expect(createPhotoPIObservations({ comparisons: [noFinding] }).some((item) => item.kind === "photo_insufficient_comparison")).toBe(true);
  });

  it("preserves persistent identity across direction changes", () => {
    const first = createPhotoPIObservations({ comparisons: [comparison()] });
    const changed = comparison();
    changed.findings[0].direction = "rising";
    const second = createPhotoPIObservations({ comparisons: [changed] });
    expect(find(first).id).toBe(find(second).id);
    expect(find(first).direction).not.toBe(find(second).direction);
  });

  it("maps early Build Lean Mass leanness to guardrail and fat-loss leanness to progress", () => {
    const observations = createPhotoPIObservations({ comparisons: [comparison()] });
    const build = applyPIGoalContextToObservations(observations, createPIGoalContext({
      activeGoal: buildGoal(),
      activePhase: { id: "phase-1", status: "active", startDate: "2026-07-20" },
      currentDate: "2026-07-24T12:00:00Z",
      timeZone: "America/Los_Angeles",
    }));
    expect(find(build).goalContext).toMatchObject({ observationRole: "guardrail", evidencePurpose: "early_phase_body_fat_monitoring" });
    const fatLoss = applyPIGoalContextToObservations(observations, createPIGoalContext({
      activeGoal: { id: "cut", title: "Fat Loss", type: "fat_loss", status: "active", target: { metric: "body_fat_percentage" } },
      currentDate: "2026-07-24T12:00:00Z",
      timeZone: "America/Los_Angeles",
    }));
    expect(find(fatLoss).goalContext.observationRole).toBe("progress");
  });

  it("is immutable and contains no quantified body-fat or causal conclusion", () => {
    const input = [comparison()];
    const before = structuredClone(input);
    const observations = createPhotoPIObservations({ comparisons: input });
    expect(input).toEqual(before);
    expect(JSON.stringify(observations)).not.toMatch(/body-fat percentage|fat gain|lean-mass gain|caused|protocol effectiveness/i);
  });
});

function comparison() {
  return {
    currentSessionId: "session-current",
    comparisonSessionId: "session-prior",
    currentViewId: "front-current",
    comparisonViewId: "front-prior",
    currentDate: "2026-07-24",
    comparisonDate: "2026-07-17",
    poseId: "front-relaxed",
    comparisonPoseId: "front-relaxed",
    contractionState: "relaxed",
    comparisonContractionState: "relaxed",
    bodyView: "front",
    comparisonBodyView: "front",
    imageAvailable: true,
    comparisonImageAvailable: true,
    comparisonQuality: "high",
    findings: [{ metric: "leanness", direction: "falling", repeatedDirectionCount: 1 }],
  };
}

function buildGoal() {
  return {
    id: "goal-build", title: "Build Lean Mass", type: "build_lean_mass", status: "active",
    timeline: { startDate: "2026-07-20" },
    target: { metric: "lean_mass", direction: "increase", amount: 10, unit: "lb" },
    guardrails: [{ id: "body-fat", text: "Maintain approximately 8–9% body fat.", accepted: true }],
  };
}

function find(observations) {
  return observations.find((item) => item.kind === "photo_leanness_change");
}
