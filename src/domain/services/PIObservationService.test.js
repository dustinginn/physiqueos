import { describe, expect, it } from "vitest";
import {
  assertUniquePIObservationIds,
  createPIObservation,
  createPIObservationId,
  filterPIObservationsByDomain,
  filterPIObservationsByKind,
  isPIObservation,
  normalizePIEvidenceIds,
  normalizePIObservation,
  PI_OBSERVATION_SCHEMA_VERSION,
  sortPIObservations,
  validatePIObservation,
} from "./PIObservationService";

function minimal(overrides = {}) {
  return {
    domain: "training",
    kind: "training_performance",
    subject: { type: "exercise", id: "seated_cable_rows" },
    status: "improving",
    direction: "positive",
    evidenceWindow: {
      startDate: "2026-07-01",
      endDate: "2026-07-18",
    },
    provenance: {
      producer: "test_producer",
      producerVersion: "v1",
      calculationMethod: "fixture",
    },
    ...overrides,
  };
}

describe("PI observation contract", () => {
  it("creates a valid minimal observation with explicit neutral defaults", () => {
    const observation = createPIObservation(minimal());

    expect(observation).toMatchObject({
      id: "pi|training|training_performance|seated_cable_rows",
      schemaVersion: PI_OBSERVATION_SCHEMA_VERSION,
      supportingEvidenceIds: [],
      contradictingEvidenceIds: [],
      confidence: { level: "unevaluated", score: null },
      materiality: { level: "unevaluated", score: null },
      goalContext: null,
      novelty: { state: "unevaluated" },
      lifecycle: { state: "unevaluated" },
      explanationData: {},
    });
    expect(validatePIObservation(observation)).toBe(true);
    expect(isPIObservation(observation)).toBe(true);
    expect(JSON.parse(JSON.stringify(observation))).toEqual(observation);
  });

  it("normalizes a fully populated observation and goal context", () => {
    const observation = createPIObservation(
      minimal({
        supportingEvidenceIds: ["session_b", "session_a", "session_b"],
        contradictingEvidenceIds: ["scan_b", "scan_a"],
        confidence: {
          level: "high",
          score: 88,
          reasons: ["Comparable sessions"],
          factors: [{ id: "session_count", impact: 3 }],
          limitations: ["Short window"],
          method: "training_session_count",
        },
        materiality: {
          level: "moderate",
          score: 60,
          basis: ["Goal relevance supplied by caller"],
          method: "caller_supplied",
        },
        goalContext: {
          activeGoalId: "goal_build_lean_mass",
          goalType: "build_lean_mass",
          goalPhase: "phase_1",
          phaseStartDate: "2026-07-20",
          phaseAgeDays: 4,
          phaseAgeWeeks: 0.57,
          observationRole: "guardrail",
          primaryOutcomeRelevance: false,
          guardrailRelevance: true,
        },
        explanationData: { volume: { current: 1200, prior: 1000 } },
        novelty: { state: "unevaluated" },
        lifecycle: { state: "unevaluated" },
      })
    );

    expect(observation.supportingEvidenceIds).toEqual(["session_a", "session_b"]);
    expect(observation.contradictingEvidenceIds).toEqual(["scan_a", "scan_b"]);
    expect(observation.goalContext).toMatchObject({
      phaseAgeDays: 4,
      phaseAgeWeeks: 0.57,
      observationRole: "guardrail",
      primaryOutcomeRelevance: false,
      guardrailRelevance: true,
    });
  });

  it.each(["progress", "guardrail", "risk", "context", "unknown"])(
    "represents the %s goal role",
    (observationRole) => {
      expect(
        createPIObservation(
          minimal({ goalContext: { observationRole } })
        ).goalContext.observationRole
      ).toBe(observationRole);
    }
  );

  it("allows absent evidence dates for an insufficient-data observation", () => {
    const observation = createPIObservation(
      minimal({
        status: "insufficient_data",
        direction: "not_applicable",
        evidenceWindow: { startDate: null, endDate: null },
      })
    );
    expect(observation.evidenceWindow).toMatchObject({
      startDate: null,
      endDate: null,
    });
  });

  it("represents measured movement without assigning goal value", () => {
    const observation = createPIObservation(
      minimal({
        status: "observed",
        direction: "rising",
      })
    );
    expect(observation.status).toBe("observed");
    expect(observation.direction).toBe("rising");
  });

  it.each([
    [{ ...minimal(), domain: "sleep" }, /domain must be one of/],
    [{ ...minimal(), status: "excellent" }, /status must be one of/],
    [{ ...minimal(), direction: "up" }, /direction must be one of/],
    [{ ...minimal(), subject: { type: "exercise" } }, /subject requires/],
    [{ ...minimal(), evidenceWindow: { startDate: "07-01-2026", endDate: "2026-07-18" } }, /YYYY-MM-DD/],
    [{ ...minimal(), explanationData: { invalid: undefined } }, /JSON-safe/],
  ])("rejects malformed contract input", (input, error) => {
    expect(() => createPIObservation(input)).toThrow(error);
    expect(isPIObservation(input)).toBe(false);
  });

  it("rejects unsupported placeholder enum values without evaluating history", () => {
    expect(() =>
      createPIObservation(minimal({ novelty: { state: "new" } }))
    ).toThrow(/novelty.state/);
    expect(() =>
      createPIObservation(minimal({ lifecycle: { state: "new" } }))
    ).not.toThrow();
  });
});

describe("PI semantic identity", () => {
  it("is stable across status, confidence, and evidence-window changes", () => {
    const first = createPIObservation(minimal());
    const second = createPIObservation(
      minimal({
        status: "regressing",
        direction: "negative",
        evidenceWindow: {
          startDate: "2026-07-10",
          endDate: "2026-07-24",
        },
        confidence: { level: "high" },
      })
    );
    expect(second.id).toBe(first.id);
  });

  it("changes with domain, kind, subject, and semantic scope", () => {
    const base = {
      domain: "training",
      kind: "training_performance",
      subjectKey: "resistance",
    };
    const ids = [
      createPIObservationId(base),
      createPIObservationId({ ...base, domain: "weight" }),
      createPIObservationId({ ...base, kind: "frequency" }),
      createPIObservationId({ ...base, subjectKey: "cardio" }),
      createPIObservationId({ ...base, semanticScope: "event_scan_1" }),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("preserves an explicit existing ID", () => {
    expect(
      createPIObservation(minimal({ id: "performance|exercise|legacy_id" })).id
    ).toBe("performance|exercise|legacy_id");
  });
});

describe("PI observation set utilities", () => {
  const training = createPIObservation(minimal());
  const weight = createPIObservation(
    minimal({
      domain: "weight",
      kind: "weight_trend",
      subject: { type: "whole_body", id: "body_weight" },
      status: "stable",
      direction: "neutral",
    })
  );

  it("normalizes evidence IDs deterministically and keeps arrays distinct", () => {
    expect(normalizePIEvidenceIds(["b", "a", "b"])).toEqual(["a", "b"]);
    expect(
      createPIObservation({
        ...minimal(),
        supportingEvidenceIds: ["shared", "support"],
        contradictingEvidenceIds: ["shared", "contradiction"],
      })
    ).toMatchObject({
      supportingEvidenceIds: ["shared", "support"],
      contradictingEvidenceIds: ["contradiction", "shared"],
    });
    expect(() => normalizePIEvidenceIds(["valid", ""])).toThrow(
      /non-empty string/
    );
  });

  it("sorts and filters deterministically", () => {
    expect(sortPIObservations([weight, training]).map((item) => item.id)).toEqual(
      [training.id, weight.id].sort()
    );
    expect(filterPIObservationsByDomain([training, weight], "weight")).toEqual([
      weight,
    ]);
    expect(
      filterPIObservationsByKind([training, weight], "training_performance")
    ).toEqual([training]);
  });

  it("fails visibly on duplicate semantic IDs", () => {
    expect(() => assertUniquePIObservationIds([training, training])).toThrow(
      /Duplicate PI observation IDs/
    );
    expect(() => sortPIObservations([training, training])).toThrow(
      /Duplicate PI observation IDs/
    );
  });
});
