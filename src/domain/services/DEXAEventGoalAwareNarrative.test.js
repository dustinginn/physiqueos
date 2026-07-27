import { describe, expect, it, vi } from "vitest";
import { founderDEXAScans } from "../../data/founderSeed/dexaScans";
import {
  classifyBodyFatGuardrail,
  resolveBodyFatGuardrail,
  resolveDEXAEventContext,
} from "./DEXAEventContextService";
import { composeDEXAEventNarrative } from "./DEXAEventNarrativeService";

const userId = "user_founder_001";
const june = founderDEXAScans.find((scan) => scan.measuredAt === "2026-06-20");
const july = {
  ...structuredClone(june),
  id: "dexa_2026_07_18",
  measuredAt: "2026-07-18",
  date: "2026-07-18",
  totalMass: { value: 167.4, unit: "lb" },
  bodyFatPercentage: 7.7,
  fatMass: { value: 12.8, unit: "lb" },
  leanMass: { value: 147.5, unit: "lb" },
  boneMineralContent: { value: 7.1, unit: "lb" },
  restingMetabolicRate: { value: 1794, unit: "kcal/day" },
};
const goal = {
  id: "goal_build",
  userId,
  title: "Build Lean Mass",
  type: "build_lean_mass",
  status: "active",
  primary: true,
  sourceGoalId: "goal_visible_abs",
  timeline: { startDate: "2026-07-20" },
  openingApproach: { value: "calibration", accepted: true },
  phases: [{ id: "phase_maintenance", name: "Establish Maintenance", status: "active", startDate: "2026-07-20" }],
  target: { metric: "lean_mass", direction: "increase", amount: 10, unit: "lb" },
  guardrails: [{ id: "body-fat", text: "Maintain approximately 8–9% body fat.", accepted: true }],
  progressMeasurement: {
    outcomeMeasures: [
      { evidenceType: "dexa_lean_mass", label: "DEXA lean mass", accepted: true },
      { evidenceType: "dexa_body_fat", label: "DEXA body fat", accepted: true },
    ],
    predictiveSignals: [],
    explanatorySignals: [],
  },
};
const completedGoal = { id: "goal_visible_abs", userId, title: "Visible Abs", status: "completed", completedAt: "2026-07-21" };

function futureScan({ leanDelta = 1.2, bodyFat = 8.4, weightDelta = null } = {}) {
  const leanMass = july.leanMass.value + leanDelta;
  const boneMass = july.boneMineralContent.value;
  const calculatedTotal = (leanMass + boneMass) / (1 - bodyFat / 100);
  const totalMass = weightDelta == null ? calculatedTotal : Math.max(calculatedTotal, july.totalMass.value + weightDelta);
  const fatMass = totalMass - leanMass - boneMass;
  return {
    ...structuredClone(july),
    id: `future_${leanDelta}_${bodyFat}_${weightDelta}`,
    measuredAt: "2026-08-15",
    date: "2026-08-15",
    leanMass: { value: leanMass, unit: "lb" },
    bodyFatPercentage: (fatMass / totalMass) * 100,
    fatMass: { value: fatMass, unit: "lb" },
    totalMass: { value: totalMass, unit: "lb" },
  };
}

function context(overrides = {}) {
  return {
    schemaVersion: "dexa_event_context_v1",
    semanticGoalType: "lean_mass_gain",
    activeGoalSummary: { id: goal.id, title: goal.title, status: "active", semanticType: "lean_mass_gain" },
    activePhase: { id: "phase_maintenance", name: "Establish Maintenance", status: "active", startDate: "2026-07-20", ageDays: 26, ageWeeks: 3 },
    operatingState: { value: "calibration", accepted: true },
    completedPriorGoal: { id: completedGoal.id, title: completedGoal.title },
    currentGoalMeasures: { primary: ["dexa_lean_mass"], guardrail: ["dexa_body_fat"], contextual: [] },
    bodyFatGuardrail: { metric: "body_fat_percentage", lowerBound: 8, upperBound: 9, unit: "%", source: "canonical_goal_guardrail_text" },
    activeProtocols: [],
    latestPriorDexa: july,
    phaseBaselineDexa: july,
    goalBaselineDexa: july,
    futureMilestone: null,
    pi: {
      status: "ready",
      observations: [{ id: "dexa-lean" }, { id: "dexa-body-fat" }],
      decisionContext: { status: "advisory", integrationEnabled: false, mutationEnabled: false },
      failure: null,
    },
    uncertainty: { state: "comparison_available", limitations: [] },
    ...overrides,
  };
}

function compose(scan, contextOverrides = {}) {
  return composeDEXAEventNarrative({
    scan,
    priorScan: july,
    phaseBaselineScan: july,
    phaseScans: [july, scan],
    goal,
    context: context(contextOverrides),
    generatedAt: "2026-08-15T18:00:00Z",
  });
}

describe("DEXA Event canonical context", () => {
  it("resolves goal, phase, calibration, prior goal, protocols, measures, baselines, milestone, and PI observations", async () => {
    const scan = futureScan();
    const repositories = {
      goals: {
        getActiveGoal: vi.fn(async () => goal),
        listGoals: vi.fn(async () => [goal, completedGoal]),
      },
      protocols: { listActiveProtocols: vi.fn(async () => [{ id: "protein", name: "Protein", status: "active", goalIds: [goal.id] }]) },
      executionItems: {
        listExecutionItems: vi.fn(async () => [
          { id: "same", type: "dexa_appointment", status: "scheduled", active: true, preferredSchedule: { date: "2026-08-15" }, linkedGoalIds: [goal.id] },
          { id: "next", type: "dexa_appointment", status: "scheduled", active: true, preferredSchedule: { date: "2026-09-12" }, linkedGoalIds: [goal.id] },
        ]),
      },
      weights: { listWeightEntries: vi.fn(async () => []) },
    };
    const result = await resolveDEXAEventContext({ repositories, userId, scan, scans: [...founderDEXAScans, july, scan] });
    expect(result).toMatchObject({
      semanticGoalType: "lean_mass_gain",
      activeGoalSummary: { id: goal.id },
      activePhase: { name: "Establish Maintenance" },
      operatingState: { value: "calibration" },
      completedPriorGoal: { id: completedGoal.id },
      bodyFatGuardrail: { lowerBound: 8, upperBound: 9 },
      phaseBaselineDexa: { id: july.id },
      futureMilestone: { id: "next", date: "2026-09-12" },
      pi: { status: "ready", decisionContext: { status: "advisory", integrationEnabled: false } },
    });
    expect(result.currentGoalMeasures.primary).toContain("dexa_lean_mass");
    expect(result.activeProtocols).toEqual([{ id: "protein", name: "Protein", category: null }]);
    expect(result.pi.observations.some((item) => item.kind === "dexa_lean_mass_change")).toBe(true);
  });

  it("returns neutral explicit context without fabricating phase, calibration, or a guardrail", async () => {
    const scan = futureScan();
    const result = await resolveDEXAEventContext({
      repositories: {
        goals: { getActiveGoal: async () => null, listGoals: async () => [] },
        protocols: { listActiveProtocols: async () => [] },
        executionItems: { listExecutionItems: async () => [] },
      },
      userId,
      scan,
      scans: [july, scan],
    });
    expect(result).toMatchObject({ status: "neutral", semanticGoalType: "unknown", activeGoal: null, activePhase: null, operatingState: null, bodyFatGuardrail: null });
  });

  it("resolves only canonical body-fat ranges and classifies deterministic boundaries", () => {
    const range = resolveBodyFatGuardrail(goal);
    expect(classifyBodyFatGuardrail(8, range).status).toBe("near_boundary");
    expect(classifyBodyFatGuardrail(8.5, range).status).toBe("within");
    expect(classifyBodyFatGuardrail(9, range).status).toBe("near_boundary");
    expect(classifyBodyFatGuardrail(7.9, range).status).toBe("below");
    expect(classifyBodyFatGuardrail(9.1, range).status).toBe("above");
    expect(classifyBodyFatGuardrail(null, range).status).toBe("unknown");
    expect(resolveBodyFatGuardrail({ ...goal, guardrails: [] })).toBeNull();
  });
});

describe("Build Lean Mass DEXA narration", () => {
  it.each([
    [{ leanDelta: 1.2, bodyFat: 8.4 }, /primary measure advanced.*guardrail remained supported/i],
    [{ leanDelta: 1.2, bodyFat: 9.4 }, /primary measure advanced.*guardrail requires review/i],
    [{ leanDelta: 0.1, bodyFat: 8.4 }, /effectively flat.*progress is not yet established/i],
    [{ leanDelta: 0.1, bodyFat: 9.4 }, /effectively flat/i],
    [{ leanDelta: -1.1, bodyFat: 8.2 }, /does not support current goal progress.*measurement uncertainty/i],
  ])("separates lean outcome and guardrail state for %o", (values, expected) => {
    const narrative = compose(futureScan(values));
    expect(narrative.interpretation.opening).toMatch(expected);
    expect(narrative.goalCompletionHandoff).toBeNull();
  });

  it("does not celebrate below-range body fat or weight gain as lean-mass proof", () => {
    const scan = futureScan({ leanDelta: 0, bodyFat: 7.5 });
    const narrative = compose(scan);
    expect(narrative.interpretation.guardrailStatus).toMatch(/Lower is not automatically better.*continued deficit/i);
    expect(narrative.hero.results.find((item) => item.label === "DEXA Weight").context).toMatch(/not proof/i);
    expect(narrative.interpretation.opening).toMatch(/progress is not yet established/i);
    expect(narrative.interpretation.opening).not.toMatch(/uncomplicated success|progress is established/i);
  });

  it("keeps calibration advisory, never mutates phase, and excludes stale goal language", () => {
    const before = structuredClone(goal);
    const narrative = compose(futureScan());
    const serialized = JSON.stringify(narrative);
    expect(narrative.interpretation.phaseMeaning).toMatch(/one scan is not enough.*phase transition/i);
    expect(narrative.coachInsight.next).toMatch(/does not advance the phase.*advisory only/i);
    expect(narrative.pi).toMatchObject({ status: "ready", decisionStatus: "advisory", decisionAdvisoryOnly: true });
    expect(narrative.goalCompletionHandoff).toBeNull();
    expect(goal).toEqual(before);
    expect(serialized).not.toMatch(/finish line of the cut|cut accomplished|visible abs remain|closing the cut/i);
  });

  it("uses a typed PI fallback and neutral goal-safe uncertainty", () => {
    const narrative = compose(futureScan(), {
      pi: {
        status: "fallback",
        observations: [],
        decisionContext: { status: "unavailable", integrationEnabled: false, mutationEnabled: false },
        failure: { code: "pi_context_failure", message: "synthetic" },
      },
    });
    expect(narrative.pi).toMatchObject({ status: "fallback", failure: { code: "pi_context_failure" } });
    expect(narrative.interpretation.uncertainty).toMatch(/PI context was unavailable.*measured scan-to-scan/i);
    expect(JSON.stringify(narrative)).not.toMatch(/finish line of the cut|cut accomplished/i);
  });

  it("does not show a same-day DEXA as its own future milestone", () => {
    const narrative = compose(futureScan(), { futureMilestone: null });
    expect(narrative.futureMilestone).toBeNull();
    expect(narrative.coachInsight.next).not.toMatch(/Aug 15/i);
  });

  it("uses neutral body-composition language when active goal context is absent", () => {
    const narrative = composeDEXAEventNarrative({
      scan: futureScan(),
      priorScan: july,
      context: context({
        semanticGoalType: "unknown",
        activeGoalSummary: null,
        activePhase: null,
        operatingState: null,
        completedPriorGoal: null,
        bodyFatGuardrail: null,
      }),
    });
    expect(narrative.hero.title).toMatch(/updates the body-composition picture/i);
    expect(narrative.interpretation.opening).toMatch(/Active goal context is unavailable/i);
    expect(narrative.goalCompletionHandoff).toBeNull();
    expect(JSON.stringify(narrative)).not.toMatch(/finish line of the cut|Build Lean Mass|Visible Abs/i);
  });

  it("treats a first eligible DEXA as a baseline without fabricating progress", () => {
    const narrative = composeDEXAEventNarrative({
      scan: july,
      priorScan: null,
      goal,
      context: context({ latestPriorDexa: null, phaseBaselineDexa: null, goalBaselineDexa: null }),
    });
    expect(narrative).toMatchObject({ priorScanId: null, goalCompletionHandoff: null });
    expect(narrative.hero.title).toMatch(/establishes a body-composition baseline/i);
    expect(narrative.interpretation.opening).toMatch(/first eligible DEXA.*baseline rather than a measured direction/i);
    expect(JSON.stringify(narrative)).not.toMatch(/finish line of the cut|cut accomplished/i);
  });
});
