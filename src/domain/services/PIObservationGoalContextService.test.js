import { describe, expect, it } from "vitest";
import {
  createPIObservation,
  isPIObservation,
} from "./PIObservationService";
import {
  applyPIGoalContextToObservations,
  createPIGoalContext,
  resolvePIObservationGoalContext,
  resolvePIPhaseAge,
} from "./PIObservationGoalContextService";
import { createWeightPIObservations } from "./WeightPIObservationService";
import { createEnergyPIObservations } from "./EnergyPIObservationService";
import { adaptTrainingObservationToPIObservation } from "./TrainingPIObservationAdapter";

const buildGoal = {
  id: "goal_build_lean_mass",
  title: "Build Lean Mass",
  type: "build_lean_mass",
  status: "active",
  primary: true,
  timeline: { startDate: "2026-07-20", targetDate: "2026-10-31" },
  target: {
    type: "numeric_change",
    metric: "lean_mass",
    direction: "increase",
    amount: 10,
    unit: "lb",
  },
  guardrails: [
    {
      id: "guardrail_body_fat",
      text: "Maintain approximately 8–9% body fat.",
      accepted: true,
    },
  ],
  progressMeasurement: {
    outcomeMeasures: [
      {
        id: "dexa_lean",
        evidenceType: "dexa_lean_mass",
        importance: "defining",
        accepted: true,
      },
      {
        id: "dexa_body_fat",
        evidenceType: "dexa_body_fat",
        importance: "defining",
        accepted: true,
      },
    ],
    predictiveSignals: [
      {
        id: "overload",
        evidenceType: "progressive_overload",
        importance: "strong",
        accepted: true,
      },
      {
        id: "weight",
        evidenceType: "scale_weight",
        importance: "supporting",
        accepted: true,
      },
      {
        id: "photos",
        evidenceType: "progress_photos",
        importance: "supporting",
        accepted: true,
      },
    ],
    explanatorySignals: [
      {
        id: "calories",
        evidenceType: "calories",
        importance: "contextual",
        accepted: true,
      },
      {
        id: "activity",
        evidenceType: "activity",
        importance: "contextual",
        accepted: true,
      },
    ],
  },
  phases: [
    {
      id: "phase_establish_maintenance",
      goalId: "goal_build_lean_mass",
      name: "Establish Maintenance",
      status: "active",
      order: 0,
      startDate: "2026-07-20",
    },
  ],
};

const bodyFatGuardrailGoal = {
  id: "goal_maintain_body_fat",
  title: "Maintain 8–9% body fat",
  type: "body_composition",
  status: "active",
  primary: false,
  metricKey: "bodyFatPercentage",
  targetRange: { min: 8, max: 9 },
  unit: "%",
};

const fatLossGoal = {
  id: "goal_fat_loss",
  title: "Fat Loss",
  type: "body_composition",
  status: "active",
  primary: true,
  startDate: "2026-05-24",
  target: { metric: "body_fat_percentage", direction: "decrease", unit: "%" },
  metricKey: "bodyWeight",
  guardrails: [
    { id: "preserve_lean", metric: "lean_mass", accepted: true },
  ],
  progressMeasurement: {
    outcomeMeasures: [
      {
        id: "body_fat",
        evidenceType: "dexa_body_fat",
        importance: "defining",
        accepted: true,
      },
      {
        id: "weight",
        evidenceType: "body_weight",
        importance: "defining",
        accepted: true,
      },
    ],
  },
  phases: [
    {
      id: "phase_cut",
      name: "Fat Loss",
      status: "active",
      startDate: "2026-05-24",
    },
  ],
};

function context(overrides = {}) {
  return createPIGoalContext({
    activeGoal: buildGoal,
    relatedGoals: [bodyFatGuardrailGoal],
    protocols: [
      { id: "protocol_training", status: "active" },
      { id: "protocol_old", status: "archived" },
    ],
    currentDate: "2026-07-24",
    ...overrides,
  });
}

function observation({
  domain = "dexa",
  kind = "dexa_lean_mass",
  subjectId = "lean_mass",
  status = "observed",
  direction = "rising",
  goalContext = null,
} = {}) {
  return createPIObservation({
    domain,
    kind,
    subject: { type: "metric", id: subjectId },
    status,
    direction,
    evidenceWindow: { startDate: "2026-07-01", endDate: "2026-07-24" },
    supportingEvidenceIds: ["evidence_2", "evidence_1"],
    confidence: { level: "moderate", method: "fixture" },
    materiality: { level: "low", method: "fixture" },
    goalContext,
    novelty: { state: "unevaluated" },
    lifecycle: { state: "unevaluated" },
    explanationData: { measuredValue: 140 },
    provenance: {
      producer: "fixture",
      producerVersion: "v1",
      calculationMethod: "fixture",
      sourceEvidenceIds: ["evidence_1", "evidence_2"],
    },
  });
}

describe("normalized PI Goal context", () => {
  it("normalizes the canonical Build Lean Mass goal and exact guardrail range", () => {
    expect(context()).toMatchObject({
      activeGoalId: "goal_build_lean_mass",
      goalType: "build_lean_mass",
      goalStatus: "active",
      semanticGoalType: "lean_mass_gain",
      goalStartDate: "2026-07-20",
      goalPhase: "establish_maintenance",
      phaseId: "phase_establish_maintenance",
      phaseStartDate: "2026-07-20",
      phaseAgeDays: 4,
      phaseAgeWeeks: 0,
      phaseAgeBand: "week_1_to_4",
      sourceGoalIds: ["goal_build_lean_mass", "goal_maintain_body_fat"],
      sourceProtocolIds: ["protocol_training"],
      provenance: {
        resolver: "pi_observation_goal_context_service",
        resolverVersion: "pi_goal_context_v1",
        sourceGoalId: "goal_build_lean_mass",
        sourcePhaseId: "phase_establish_maintenance",
      },
    });
    expect(context().targetRanges).toEqual([
      {
        metric: "body_fat_percentage",
        lowerBound: 8,
        upperBound: 9,
        unit: "%",
        source: "canonical_goal_target_range",
        sourceGoalId: "goal_maintain_body_fat",
        role: "guardrail",
      },
    ]);
    expect(JSON.parse(JSON.stringify(context()))).toEqual(context());
  });

  it("normalizes a fat-loss goal without changing its canonical type", () => {
    const result = createPIGoalContext({
      activeGoal: fatLossGoal,
      currentDate: "2026-06-01",
    });
    expect(result).toMatchObject({
      goalType: "body_composition",
      semanticGoalType: "fat_loss",
      activeGoalId: "goal_fat_loss",
    });
  });

  it("handles no active Goal, unsupported Goal, and malformed Goal conservatively", () => {
    const missing = createPIGoalContext({ currentDate: "2026-07-24" });
    const unsupported = createPIGoalContext({
      activeGoal: {
        id: "goal_unknown",
        type: "custom",
        status: "active",
        primary: true,
      },
      currentDate: "2026-07-24",
    });
    const malformed = createPIGoalContext({
      activeGoal: { type: "build_lean_mass", status: "active" },
      currentDate: "2026-07-24",
    });

    expect(missing).toMatchObject({
      activeGoalId: null,
      semanticGoalType: "unknown",
      limitations: expect.arrayContaining(["active_goal_unavailable"]),
    });
    expect(unsupported).toMatchObject({
      activeGoalId: "goal_unknown",
      semanticGoalType: "unknown",
      limitations: expect.arrayContaining(["goal_semantic_type_unsupported"]),
    });
    expect(malformed).toMatchObject({
      activeGoalId: null,
      semanticGoalType: "unknown",
      limitations: expect.arrayContaining(["active_goal_malformed"]),
    });
  });

  it("detects multiple active primary Goals deterministically", () => {
    const result = createPIGoalContext({
      activeGoals: [buildGoal, fatLossGoal],
      currentDate: "2026-07-24",
    });
    expect(result).toMatchObject({
      activeGoalId: null,
      semanticGoalType: "unknown",
      limitations: expect.arrayContaining([
        "multiple_active_primary_goals",
        "active_goal_unavailable",
      ]),
    });
  });

  it("keeps missing phases and missing start dates explicit", () => {
    const missingPhase = createPIGoalContext({
      activeGoal: { ...buildGoal, phases: [] },
      relatedGoals: [bodyFatGuardrailGoal],
      currentDate: "2026-07-24",
    });
    const missingDate = createPIGoalContext({
      activeGoal: {
        ...buildGoal,
        phases: [{ ...buildGoal.phases[0], startDate: null }],
      },
      relatedGoals: [bodyFatGuardrailGoal],
      currentDate: "2026-07-24",
    });
    expect(missingPhase.limitations).toEqual(
      expect.arrayContaining([
        "active_phase_unavailable",
        "phase_start_date_unavailable",
      ])
    );
    expect(missingDate).toMatchObject({
      phaseId: "phase_establish_maintenance",
      phaseAgeBand: "unknown",
      limitations: expect.arrayContaining(["phase_start_date_unavailable"]),
    });
  });
});

describe("phase age", () => {
  it.each([
    ["2026-07-20", 0, 0, "week_1_to_4"],
    ["2026-07-26", 6, 0, "week_1_to_4"],
    ["2026-07-27", 7, 1, "week_1_to_4"],
    ["2026-08-16", 27, 3, "week_1_to_4"],
    ["2026-08-17", 28, 4, "week_5_to_8"],
    ["2026-09-14", 56, 8, "week_9_plus"],
  ])(
    "uses day-zero phase age through %s",
    (currentDate, phaseAgeDays, phaseAgeWeeks, phaseAgeBand) => {
      expect(
        resolvePIPhaseAge({
          phaseStartDate: "2026-07-20",
          currentDate,
        })
      ).toMatchObject({ phaseAgeDays, phaseAgeWeeks, phaseAgeBand });
    }
  );

  it("handles future, missing, and invalid phase dates", () => {
    expect(
      resolvePIPhaseAge({
        phaseStartDate: "2026-07-25",
        currentDate: "2026-07-24",
      })
    ).toMatchObject({
      phaseAgeBand: "unknown",
      limitations: ["phase_start_date_in_future"],
    });
    expect(
      resolvePIPhaseAge({ phaseStartDate: null, currentDate: "2026-07-24" })
    ).toMatchObject({
      phaseAgeBand: "unknown",
      limitations: ["phase_start_date_unavailable"],
    });
    expect(
      resolvePIPhaseAge({
        phaseStartDate: "2026-02-30",
        currentDate: "2026-07-24",
      })
    ).toMatchObject({
      phaseAgeBand: "unknown",
      limitations: ["phase_start_date_invalid"],
    });
  });

  it("uses canonical local date and changes age without changing observation ID", () => {
    const beforeContext = context({
      currentDate: new Date("2026-07-25T01:00:00.000Z"),
      timeZone: "America/Los_Angeles",
    });
    const laterContext = context({ currentDate: "2026-08-17" });
    const source = observation();
    const before = resolvePIObservationGoalContext(source, beforeContext);
    const later = resolvePIObservationGoalContext(source, laterContext);
    expect(before.goalContext.phaseAgeDays).toBe(4);
    expect(later.goalContext.phaseAgeDays).toBe(28);
    expect(before.id).toBe(later.id);
  });
});

describe("observation role assignment", () => {
  it.each([
    ["dexa", "dexa_lean_mass", "lean_mass", "progress", true, false],
    ["training", "progressive_overload", "seated_cable_rows", "progress", true, false],
    ["weight", "weight_short_window_change", "body_weight", "context", false, false],
    ["weight", "weight_average_change", "body_weight", "context", false, false],
    ["energy", "energy_intake", "caloric_intake", "context", false, false],
    ["energy", "energy_expenditure", "estimated_expenditure", "context", false, false],
    ["energy", "energy_balance", "estimated_energy_balance", "context", false, false],
    ["dexa", "dexa_body_fat", "body_fat_percentage", "guardrail", false, true],
  ])(
    "maps Build Lean Mass %s/%s to %s",
    (domain, kind, subjectId, role, primary, guardrail) => {
      const enriched = resolvePIObservationGoalContext(
        observation({ domain, kind, subjectId }),
        context()
      );
      expect(enriched.goalContext).toMatchObject({
        observationRole: role,
        primaryOutcomeRelevance: primary,
        guardrailRelevance: guardrail,
      });
    }
  );

  it("keeps unrelated observations conservative", () => {
    const enriched = resolvePIObservationGoalContext(
      observation({
        domain: "goals",
        kind: "unrelated_goal_signal",
        subjectId: "other",
      }),
      context()
    );
    expect(enriched.goalContext).toMatchObject({
      observationRole: "unknown",
      primaryOutcomeRelevance: null,
      guardrailRelevance: null,
    });
  });

  it("maps fat-loss primary and guardrail roles without rewriting measurements", () => {
    const fatContext = createPIGoalContext({
      activeGoal: fatLossGoal,
      currentDate: "2026-06-01",
    });
    const sourceWeight = observation({
      domain: "weight",
      kind: "weight_short_window_change",
      subjectId: "body_weight",
      direction: "falling",
    });
    const sourceBodyFat = observation({
      domain: "dexa",
      kind: "dexa_body_fat",
      subjectId: "body_fat_percentage",
      direction: "falling",
    });
    const sourceLean = observation({
      domain: "dexa",
      kind: "dexa_lean_mass",
      subjectId: "lean_mass",
      direction: "stable",
    });
    const sourceEnergy = observation({
      domain: "energy",
      kind: "energy_balance",
      subjectId: "estimated_energy_balance",
      direction: "falling",
    });

    expect(
      resolvePIObservationGoalContext(sourceWeight, fatContext).goalContext
    ).toMatchObject({
      observationRole: "progress",
      primaryOutcomeRelevance: true,
    });
    expect(
      resolvePIObservationGoalContext(sourceBodyFat, fatContext).goalContext
    ).toMatchObject({ observationRole: "progress" });
    expect(
      resolvePIObservationGoalContext(sourceLean, fatContext).goalContext
    ).toMatchObject({
      observationRole: "guardrail",
      guardrailRelevance: true,
    });
    const energy = resolvePIObservationGoalContext(sourceEnergy, fatContext);
    expect(energy.goalContext.observationRole).toBe("context");
    expect(energy.direction).toBe("falling");
    expect(energy.confidence).toEqual(sourceEnergy.confidence);
  });
});

describe("early Phase 1 photo context", () => {
  it("marks eligible early lean-mass photos as guardrail monitoring only", () => {
    const source = observation({
      domain: "photos",
      kind: "photo_leanness",
      subjectId: "whole_body",
      status: "observed",
      direction: "stable",
    });
    const enriched = resolvePIObservationGoalContext(source, context());
    expect(enriched.goalContext).toMatchObject({
      observationRole: "guardrail",
      guardrailRelevance: true,
      evidencePurpose: "early_phase_body_fat_monitoring",
    });
    expect(enriched.explanationData).toEqual(source.explanationData);
    expect(enriched).not.toHaveProperty("bodyFatEstimate");
    expect(JSON.stringify(enriched.goalContext)).not.toMatch(
      /fat gain|muscle gain|loss of definition|goal success/i
    );
  });

  it("does not apply early-phase purpose after day 28", () => {
    const enriched = resolvePIObservationGoalContext(
      observation({
        domain: "photos",
        kind: "photo_leanness",
        subjectId: "whole_body",
      }),
      context({ currentDate: "2026-08-17" })
    );
    expect(enriched.goalContext).toMatchObject({
      observationRole: "context",
      evidencePurpose: null,
    });
  });

  it("does not apply the mapping to fat loss, absent guardrails, or ineligible kinds", () => {
    const photo = observation({
      domain: "photos",
      kind: "photo_leanness",
      subjectId: "whole_body",
    });
    const fatContext = createPIGoalContext({
      activeGoal: fatLossGoal,
      currentDate: "2026-05-25",
    });
    const noGuardrail = createPIGoalContext({
      activeGoal: {
        ...buildGoal,
        guardrails: [],
        progressMeasurement: {
          ...buildGoal.progressMeasurement,
          outcomeMeasures: buildGoal.progressMeasurement.outcomeMeasures.filter(
            (item) => item.evidenceType !== "dexa_body_fat"
          ),
        },
      },
      currentDate: "2026-07-24",
    });
    const ineligible = observation({
      domain: "photos",
      kind: "photo_capture_quality",
      subjectId: "front_relaxed",
    });
    expect(
      resolvePIObservationGoalContext(photo, fatContext).goalContext
        .evidencePurpose
    ).toBeNull();
    expect(
      resolvePIObservationGoalContext(photo, noGuardrail).goalContext
        .evidencePurpose
    ).toBeNull();
    expect(
      resolvePIObservationGoalContext(ineligible, context()).goalContext
        .evidencePurpose
    ).toBeNull();
  });
});

describe("immutability and compatibility", () => {
  it("changes only goalContext and records canonical Goal conflicts", () => {
    const source = observation({
      goalContext: {
        activeGoalId: "old_goal",
        goalType: "body_composition",
        observationRole: "unknown",
        sourceGoalIds: ["old_goal"],
        limitations: ["source_context_limited"],
      },
    });
    const snapshot = structuredClone(source);
    const enriched = resolvePIObservationGoalContext(source, context());

    expect(source).toEqual(snapshot);
    for (const field of [
      "id",
      "domain",
      "kind",
      "subject",
      "status",
      "direction",
      "evidenceWindow",
      "supportingEvidenceIds",
      "contradictingEvidenceIds",
      "confidence",
      "materiality",
      "novelty",
      "lifecycle",
      "explanationData",
      "provenance",
    ]) {
      expect(enriched[field]).toEqual(source[field]);
    }
    expect(enriched.goalContext).toMatchObject({
      activeGoalId: "goal_build_lean_mass",
      limitations: expect.arrayContaining(["source_context_limited"]),
      conflicts: [
        {
          field: "activeGoalId",
          existingValue: "old_goal",
          resolvedValue: "goal_build_lean_mass",
          resolution: "canonical_active_goal",
        },
      ],
    });
    expect(isPIObservation(enriched)).toBe(true);
  });

  it("preserves valid source context when no canonical active Goal is available", () => {
    const source = observation({
      goalContext: {
        activeGoalId: "source_goal",
        goalType: "performance",
        semanticGoalType: "performance",
        observationRole: "context",
        primaryOutcomeRelevance: false,
        guardrailRelevance: false,
        sourceGoalIds: ["source_goal"],
        provenance: { resolver: "source_resolver" },
      },
    });
    const enriched = resolvePIObservationGoalContext(
      source,
      createPIGoalContext({ currentDate: "2026-07-24" })
    );
    expect(enriched.goalContext).toMatchObject({
      activeGoalId: "source_goal",
      goalType: "performance",
      semanticGoalType: "performance",
      sourceGoalIds: ["source_goal"],
      provenance: { resolver: "source_resolver" },
    });
  });

  it("enriches Weight, Energy, and Training observations without changing sorting", () => {
    const weightObservation = createWeightPIObservations({
      weights: [
        { id: "w1", measuredAt: "2026-07-20", weight: { value: 165, unit: "lb" } },
        { id: "w2", measuredAt: "2026-07-24", weight: { value: 166, unit: "lb" } },
      ],
      observationWindow: { startDate: "2026-07-20", endDate: "2026-07-24" },
      requestedScopes: ["short_window"],
    })[0];
    const energyObservation = createEnergyPIObservations({
      reconciliationInput: {
        nutritionDays: [
          { id: "n1", date: "2026-07-24", totals: { calories: 2300 } },
        ],
      },
      observationWindow: { startDate: "2026-07-20", endDate: "2026-07-24" },
      requestedKinds: ["energy_intake"],
    })[0];
    const trainingObservation = adaptTrainingObservationToPIObservation({
      id: "performance|exercise|rows",
      observation_type: "training_performance",
      scope: "exercise",
      exercise: { key: "rows", name: "Rows" },
      status: "improving",
      evidence_date_range: { start: "2026-07-20", end: "2026-07-24" },
      supporting_session_ids: ["session_1"],
      confidence: "low",
      explanation_data: {},
      provenance: {
        source: "TrainingPerformanceIntelligenceService",
        training_session_ids: ["session_1"],
      },
    });
    const source = [weightObservation, trainingObservation, energyObservation];
    const enriched = applyPIGoalContextToObservations(source, context());
    expect(enriched.map((item) => item.id)).toEqual(
      source.map((item) => item.id).sort()
    );
    expect(enriched.every(isPIObservation)).toBe(true);
    enriched.forEach((item) => {
      const original = source.find((candidate) => candidate.id === item.id);
      expect(item.materiality).toEqual(original.materiality);
      expect(item.novelty).toEqual(original.novelty);
      expect(item.lifecycle).toEqual(original.lifecycle);
    });
  });
});
