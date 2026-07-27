import { describe, expect, it } from "vitest";
import {
  createPIGoalConfidenceAssessment,
  createPIGoalConfidenceInputFingerprint,
  PIGoalConfidenceValidationError,
  PI_GOAL_CONFIDENCE_ASSESSMENT_TYPE,
  PI_GOAL_CONFIDENCE_SEMANTIC_DEFINITION,
  validatePIGoalConfidenceAssessment,
} from "./PIGoalConfidenceAssessmentModel";
import {
  createPIGoalConfidenceContractFixture,
  PI_GOAL_CONFIDENCE_CONTRACT_SCENARIOS,
} from "../../fixtures/piGoalConfidenceAssessmentFixtures";

const create = (scenario = "initial_no_prior", overrides = {}) =>
  createPIGoalConfidenceAssessment(
    createPIGoalConfidenceContractFixture(scenario, overrides)
  );

describe("PIGoalConfidenceAssessmentModel", () => {
  it("defines goal-progress confidence independently of other PI confidence concepts", () => {
    const result = create();
    expect(result.assessmentType).toBe(PI_GOAL_CONFIDENCE_ASSESSMENT_TYPE);
    expect(result.semanticDefinition).toBe(PI_GOAL_CONFIDENCE_SEMANTIC_DEFINITION);
    expect(result).not.toHaveProperty("claimConfidence");
    expect(result).not.toHaveProperty("decisionConfidence");
    expect(result).not.toHaveProperty("presentationReadiness");
  });

  it.each([
    ["initial_no_prior", "initial"],
    ["increased", "increased"],
    ["held", "held"],
    ["decreased", "decreased"],
  ])("normalizes the %s movement contract", (scenario, direction) => {
    const result = create(scenario);
    expect(result.score.movement.direction).toBe(direction);
    expect(validatePIGoalConfidenceAssessment(result)).toBe(true);
  });

  it.each(PI_GOAL_CONFIDENCE_CONTRACT_SCENARIOS)(
    "supports contract scenario %s without deriving a production score",
    (scenario) => {
      expect(create(scenario).id).toMatch(/^pi_goal_confidence\|[a-f0-9]{64}$/);
    }
  );

  it.each([
    [{ score: { current: -1 } }, "invalid_score"],
    [{ score: { current: 101 } }, "invalid_score"],
    [{
      score: {
        current: 51, prior: 50, delta: 0,
        movementDirection: "increased", movementMagnitude: "small",
        priorScoreProvenance: { source: "canonical_pi_assessment" },
      },
    }, "inconsistent_score_delta"],
    [{
      score: {
        current: 51, prior: 50,
        movementDirection: "held", movementMagnitude: "small",
        priorScoreProvenance: { source: "canonical_pi_assessment" },
      },
    }, "inconsistent_movement_direction"],
    [{
      score: {
        current: 49, prior: 50,
        movementDirection: "increased", movementMagnitude: "small",
        priorScoreProvenance: { source: "canonical_pi_assessment" },
      },
    }, "inconsistent_movement_direction"],
  ])("rejects invalid score/movement semantics with typed code %s", (override, code) => {
    try {
      create("initial_no_prior", override);
      throw new Error("Expected validation failure.");
    } catch (error) {
      expect(error).toBeInstanceOf(PIGoalConfidenceValidationError);
      expect(error.code).toBe(code);
    }
  });

  it.each([
    ["direction", "unsupported", "invalid_contributor_direction"],
    ["strength", "extreme", "invalid_contributor_strength"],
    ["domain", "calories", "invalid_contributor_domain"],
  ])("rejects invalid contributor %s", (field, value, code) => {
    const contributor = structuredClone(
      createPIGoalConfidenceContractFixture().contributors[0]
    );
    contributor[field] = value;
    expect(() => create("initial_no_prior", { contributors: [contributor] }))
      .toThrow(expect.objectContaining({ code }));
  });

  it("rejects duplicate contributor IDs", () => {
    const contributor = createPIGoalConfidenceContractFixture().contributors[0];
    expect(() => create("initial_no_prior", {
      contributors: [contributor, structuredClone(contributor)],
    })).toThrow(expect.objectContaining({ code: "duplicate_contributor_id" }));
  });

  it("deduplicates and orders source references canonically", () => {
    const result = create("initial_no_prior", {
      provenance: {
        sourceObservationIds: ["z", "a", "z"],
        sourceClaimIds: ["b", "a", "b"],
        canonicalEvidenceReferences: [
          { id: "z", type: "weight" },
          { id: "a", type: "training" },
          { id: "z", type: "weight" },
        ],
      },
    });
    expect(result.provenance.sourceObservationIds).toEqual(["a", "z"]);
    expect(result.provenance.sourceClaimIds).toEqual(["a", "b"]);
    expect(result.provenance.canonicalEvidenceReferences.map((item) => item.id))
      .toEqual(["a", "z"]);
  });

  it("makes contributor and reference ordering identity-neutral", () => {
    const fixture = createPIGoalConfidenceContractFixture(
      "contributor_ordering_variation"
    );
    const reversed = structuredClone(fixture);
    reversed.contributors.reverse();
    reversed.provenance.sourceObservationIds.reverse();
    reversed.provenance.sourceClaimIds.reverse();
    reversed.provenance.canonicalEvidenceReferences.reverse();
    expect(createPIGoalConfidenceAssessment(fixture).id)
      .toBe(createPIGoalConfidenceAssessment(reversed).id);
  });

  it("excludes generation time and presentation prose from identity", () => {
    const fixture = createPIGoalConfidenceContractFixture();
    const changed = createPIGoalConfidenceContractFixture("initial_no_prior", {
      generatedAt: "2026-08-01T00:00:00Z",
      primaryReason: "Formatting and presentation wording changed.",
      coachingImplication: "Different display wording.",
      contributors: fixture.contributors.map((item) => ({
        ...item,
        label: "A differently formatted contributor label",
        reason: "Different user-facing contributor prose.",
        userFacing: !item.userFacing,
      })),
    });
    expect(createPIGoalConfidenceAssessment(fixture).id)
      .toBe(createPIGoalConfidenceAssessment(changed).id);
  });

  it.each([
    ["goalId", "another_goal"],
    ["phaseId", "another_phase"],
    ["operatingState", "active_build"],
    ["piVersion", "pi_v4"],
  ])("changes identity when semantic field %s changes", (field, value) => {
    expect(create().id).not.toBe(create("initial_no_prior", { [field]: value }).id);
  });

  it("changes identity across evidence windows and fingerprints", () => {
    const weekly = create("weekly_closed_window");
    const anotherWindow = create("weekly_closed_window", {
      context: { evidenceWindowId: "weekly_2026-07-26_2026-08-01" },
    });
    expect(weekly.id).not.toBe(anotherWindow.id);
    const changedReasoning = create("weekly_closed_window", {
      reasoning: {
        observations: [{
          id: "observation_training",
          domain: "training",
          direction: "negative",
        }],
      },
    });
    expect(weekly.provenance.inputFingerprint)
      .not.toBe(changedReasoning.provenance.inputFingerprint);
    expect(weekly.id).not.toBe(changedReasoning.id);
  });

  it("changes identity across confidence-model versions by rejecting unsupported versions", () => {
    expect(() => create("initial_no_prior", {
      modelVersion: "pi_goal_confidence_assessment_v2",
    })).toThrow(expect.objectContaining({ code: "unsupported_model_version" }));
  });

  it("requires bounded windows and event identities for their contexts", () => {
    expect(() => create("initial_no_prior", {
      context: { type: "weekly_closed_window", cadence: "weekly" },
    })).toThrow(expect.objectContaining({ code: "missing_evidence_window" }));
    expect(() => create("initial_no_prior", {
      context: { type: "photo_event", cadence: "event" },
    })).toThrow(expect.objectContaining({ code: "missing_event_id" }));
  });

  it("supports a legacy 44 prior without representing it as PI-derived", () => {
    const result = create("legacy_44_prior_provenance");
    expect(result.score.prior).toBe(44);
    expect(result.score.priorScoreProvenance).toEqual({
      source: "legacy_home_presentation",
      assessmentId: null,
      modelVersion: "overall_goal_confidence_v1",
    });
    expect(result.score.priorScoreProvenance.source)
      .not.toBe("canonical_pi_assessment");
  });

  it("is deeply immutable and deterministic", () => {
    const fixture = createPIGoalConfidenceContractFixture();
    const before = structuredClone(fixture);
    const first = createPIGoalConfidenceAssessment(fixture);
    expect(fixture).toEqual(before);
    expect(createPIGoalConfidenceAssessment(fixture)).toEqual(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.contributors[0])).toBe(true);
    expect(() => {
      first.contributors[0].label = "changed";
    }).toThrow();
  });

  it("fingerprints only canonical semantic fields", () => {
    const left = createPIGoalConfidenceContractFixture();
    const right = structuredClone(left);
    right.reasoning.observations[0].displayLabel = "A display-only label";
    right.reasoning.observations[0].generatedAt = "2099-01-01T00:00:00Z";
    expect(createPIGoalConfidenceInputFingerprint(left))
      .toBe(createPIGoalConfidenceInputFingerprint(right));
  });
});
