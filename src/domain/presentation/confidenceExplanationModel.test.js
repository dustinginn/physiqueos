import { describe, expect, it } from "vitest";
import {
  buildConfidenceExplanationModel,
  confidenceExplanationDetailFromModel,
} from "./confidenceExplanationPresentation";
import {
  findFounderPresentationLeaks,
} from "./productLanguagePresentation";

describe("Confidence V2 shared explanation model", () => {
  it("explains the accepted held Monthly assessment from canonical lineage", () => {
    const model = buildConfidenceExplanationModel({
      assessment: acceptedMonthly(),
      surface: "monthly",
    });
    expect(model).toMatchObject({
      score: 62,
      bandLabel: "Moderate",
      movementLabel: "No meaningful change",
      sourceAssessmentId: "assessment-current",
    });
    expect(model.summary).toContain(
      "Training progression is the strongest supportive domain signal, repeating across 2 independent weekly periods."
    );
    expect(model.summary).toContain("Energy calibration");
    expect(model.summary).toContain("Recovery coverage");
    expect(model.summary).toContain("no material contradiction emerged");
    expect(model.summary).toContain("follow-up DEXA is the next major test");
    expect(model.summary).not.toMatch(/Photos|Weight/);
    expect(model.movementExplanation.text).toBe(
      "Nothing material changed versus the predecessor; Confidence held 62% → 62%."
    );
    expect(findFounderPresentationLeaks(model)).toEqual([]);
  });

  it("normalizes ID-suffixed factors without dropping their canonical lineage", () => {
    const model = buildConfidenceExplanationModel({
      assessment: acceptedMonthly(),
      surface: "home",
    });
    const feasible = model.supportingFactors.find((item) =>
      item.semanticToken === "objective_feasible");
    expect(feasible.code).toBe("objective_feasible:objective|build_lean_mass|v2");
    expect(feasible.text).toBe("The objective remains feasible.");
    expect(model.summary).toBe(
      "The Goal remains feasible and on its expected path. Training is supportive, but Energy calibration, Recovery coverage, and a follow-up body-composition check are not conclusive yet."
    );
  });

  it("distinguishes uncertainty from contradiction", () => {
    const model = buildConfidenceExplanationModel({
      assessment: acceptedMonthly(),
    });
    const energy = model.limitingFactors.find((item) =>
      item.semanticToken === "energy_calibration_uncertain");
    const recovery = model.limitingFactors.find((item) =>
      item.semanticToken === "recovery_coverage_incomplete");
    expect(energy.isContradiction).toBe(false);
    expect(recovery.isContradiction).toBe(false);
    expect(energy.text).not.toMatch(/fail|poor/i);
    expect(recovery.text).not.toMatch(/fail|poor/i);
  });

  it("uses the same factors for Home, Goal, Weekly, and Monthly depth", () => {
    const assessment = acceptedMonthly();
    const models = ["home", "goal", "weekly", "monthly"].map((surface) =>
      buildConfidenceExplanationModel({ assessment, surface }));
    expect(models.map((model) => model.supportingFactors.map((item) =>
      item.semanticToken))).toEqual(Array(4).fill(models[0].supportingFactors
      .map((item) => item.semanticToken)));
    expect(models.map((model) => model.sourceAssessmentId))
      .toEqual(Array(4).fill("assessment-current"));
  });

  it("renders DEXA baseline semantics and historical chronology", () => {
    const model = buildConfidenceExplanationModel({
      assessment: acceptedMonthly({
        id: "assessment-dexa",
        publisherType: "dexa_event_briefing",
        priorPercentage: 59,
        currentPercentage: 59,
      }),
      surface: "dexa_event",
      historicalContext: { eventDate: "2026-08-15" },
    });
    expect(model.summary).toContain("August 15 DEXA");
    expect(model.summary).toContain("next decision baseline");
    expect(model.summary).toContain("does not replace today's Confidence");
  });

  it("binds increase and decrease language to their structured drivers", () => {
    const increased = buildConfidenceExplanationModel({
      assessment: acceptedMonthly({
        priorPercentage: 59,
        currentPercentage: 60,
        movement: "increase",
        movementMagnitude: "small",
      }),
      surface: "weekly",
    });
    expect(increased.movementExplanation.text).toContain(
      "Confidence increased from 59% to 60%."
    );
    expect(increased.movementExplanation.text).not.toMatch(/weaken|declin/i);

    const decreased = buildConfidenceExplanationModel({
      assessment: acceptedMonthly({
        priorPercentage: 62,
        currentPercentage: 57,
        confidenceBand: "developing",
        movement: "decrease",
        movementMagnitude: "material",
        forecastExplanationLineage: {
          primarySupportingFactors: ["quality_adequate"],
          primaryLimitingFactors: ["objective_unlikely:goal|build_lean_mass|v2"],
        },
      }),
    });
    expect(decreased.movementExplanation.text).toContain(
      "The current evidence makes the objective unlikely"
    );
    expect(decreased.movementExplanation.text).toContain(
      "Confidence decreased from 62% to 57%."
    );
  });

  it("does not use held-event baseline wording for a DEXA increase", () => {
    const model = buildConfidenceExplanationModel({
      assessment: acceptedMonthly({
        priorPercentage: 59,
        currentPercentage: 60,
        movement: "increase",
        movementMagnitude: "small",
      }),
      surface: "dexa_event",
      historicalContext: { eventDate: "2026-08-15" },
    });
    expect(model.summary).toContain("Confidence increased from 59% to 60%");
    expect(model.summary).not.toContain("It did not raise Confidence");
  });

  it("renders matched-only Photo context without inventing Photo causality", () => {
    const model = buildConfidenceExplanationModel({
      assessment: acceptedMonthly(),
      surface: "photo_event",
      historicalContext: { matchedOnly: true, eventDate: "2026-08-22" },
    });
    expect(model.summary).toContain("matched historical event did not publish a successor assessment");
    expect(model.summary).toContain("does not retain enough participating Photo factor lineage");
    expect(model.summary).not.toMatch(/Photos (?:raised|increased|supported)/i);
  });

  it("fails closed when structured factors are absent", () => {
    const model = buildConfidenceExplanationModel({
      assessment: acceptedMonthly({
        forecastExplanationLineage: {},
        remainingUncertainty: { status: "unknown", items: [] },
        nextConfidenceBuildingEvidence: { status: "not_identified" },
        evidenceDurability: null,
        sourceLineage: {},
      }),
    });
    expect(model.degradation.status).toBe("insufficient");
    expect(model.summary).toContain("does not contain enough structured factor detail");
    expect(model.summary).not.toMatch(/undefined|null|_/);
  });

  it("omits unknown factors with a typed warning instead of leaking the code", () => {
    const model = buildConfidenceExplanationModel({
      assessment: acceptedMonthly({
        forecastExplanationLineage: {
          primarySupportingFactors: ["future_backend_factor_v9"],
          primaryLimitingFactors: [],
        },
        remainingUncertainty: { status: "unknown", items: [] },
        nextConfidenceBuildingEvidence: { status: "not_identified" },
        evidenceDurability: null,
        sourceLineage: {},
      }),
    });
    expect(model.degradation).toMatchObject({
      status: "insufficient",
      warnings: [{ kind: "unknown_factor", code: "future_backend_factor_v9" }],
    });
    expect(model.summary).not.toContain("future_backend_factor_v9");
  });

  it("provides the four detail questions from one model", () => {
    const detail = confidenceExplanationDetailFromModel(
      buildConfidenceExplanationModel({ assessment: acceptedMonthly() })
    );
    expect(detail.supportingFactors.length).toBeGreaterThan(0);
    expect(detail.limitingFactors.length).toBeGreaterThan(0);
    expect(detail.movementFactors).toEqual([
      "Nothing material changed versus the predecessor; Confidence held 62% → 62%.",
    ]);
    expect(detail.clarifyingFactors[0]).toContain("follow-up DEXA");
  });
});

function acceptedMonthly(overrides = {}) {
  return {
    schemaVersion: "canonical_confidence_assessment_v2",
    id: "assessment-current",
    currentPercentage: 62,
    priorPercentage: 62,
    confidenceBand: "moderate",
    movement: "no_meaningful_change",
    movementMagnitude: "none",
    sourceCutoff: "2026-09-01T06:59:59.999Z",
    publisherType: "monthly_briefing",
    forecastExplanationLineage: {
      primarySupportingFactors: [
        "attainability_on_expected_trajectory",
        "objective_feasible:objective|build_lean_mass|v2",
        "quality_adequate",
      ],
      primaryLimitingFactors: [
        "agreement_mixed",
        "guardrails_watch",
        "strategy_still_calibrating",
      ],
    },
    narrativeExplanation: {
      movementRationaleCode: "forecast_change_not_material",
      text: "Stored canonical narrative is retained for audit only.",
    },
    remainingUncertainty: {
      status: "material",
      items: [
        { id: "energy-question", kind: "energy_calibration_uncertain", materiality: "moderate" },
        { id: "recovery-question", kind: "recovery_evidence_missing", materiality: "moderate" },
        { id: "measurement-question", kind: "measurement_pending", materiality: "high" },
        { id: "configuration-question", kind: "goal_semantics_missing", materiality: "moderate" },
      ],
    },
    nextConfidenceBuildingEvidence: {
      status: "identified",
      evidenceCapability: "dexa_body_composition",
      expectedEventType: "dexa_scan",
      decisionBoundary: "durable lean-mass response",
      uncertaintyRefs: ["measurement-question"],
    },
    evidenceDurability: {
      persistence: "repeated",
      independentPeriodCount: 2,
      contradictionState: "none",
      corroboratingCapabilities: ["training_progression"],
      signals: [{
        capability: "training_progression",
        direction: "supporting",
        persistence: "repeated",
        independentPeriodCount: 2,
        lineageAvailable: true,
      }],
    },
    sourceLineage: {
      evidenceNormalization: {
        descriptors: [
          { capability: "training_progression", agreement: "supports" },
          { capability: "energy_availability", agreement: "indeterminate" },
          { capability: "body_weight_trend", agreement: "indeterminate" },
          { capability: "recovery_capacity", agreement: "indeterminate" },
          { capability: "dexa_body_composition", agreement: "indeterminate" },
        ],
      },
      confidenceExplanationDrivers: {
        strengthenedBy: [], limitedBy: [],
        materiallyChanged: { rationale: "forecast_no_meaningful_change" },
      },
    },
    ...overrides,
  };
}
