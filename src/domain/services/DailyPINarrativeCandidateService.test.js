import { describe, expect, it } from "vitest";
import {
  createDailyPINarrativeCandidate,
  renderDailyPICandidate,
  selectAuthoritativeDailyPICandidates,
} from "./DailyPINarrativeCandidateService";
import { resolveAuthoritativeDailyPISelection } from "./DailyBriefingService";
import { createTrainingPerformanceIntelligenceReport } from "./TrainingPerformanceIntelligenceService";

function claim({
  confidence = "high",
  domains = ["training", "weight"],
  kind = "training_progress_weight_stability",
  lifecycle = null,
  limitations = [],
} = {}) {
  return {
    id: `pi_claim|${domains.join("+")}|${kind}|daily`,
    kind,
    participatingDomains: domains,
    confidence: { level: confidence },
    limitations,
    explanationData: {
      relationship: kind,
      trainingDirection: "improving",
      weightDirection: kind.includes("stability") ? "stable" : "rising",
      energyDirection: "rising",
    },
    ...(lifecycle ? { lifecycle: { state: lifecycle } } : {}),
  };
}

function ranking(value = claim(), overrides = {}) {
  return {
    claimId: value.id,
    claim: value,
    rank: 1,
    priorityBand: "primary",
    priorityScore: 80,
    selectionState: "primary",
    ...overrides,
  };
}

function piResult({
  primary = [ranking()],
  supporting = [],
  weightMode = "exact_daily_precomputed",
  energyMode = "exact_daily_precomputed",
} = {}) {
  return {
    provenance: {
      internalWindows: {
        weight: { mode: weightMode },
        energy: { mode: energyMode },
      },
    },
    rankingResult: { primary, supporting },
  };
}

describe("authoritative Daily PI candidate selection", () => {
  it.each([
    ["Training × Weight", claim()],
    ["Weight × Energy", claim({
      domains: ["energy", "weight"],
      kind: "intake_weight_stability",
    })],
  ])("selects a ranked exact %s primary", (_name, value) => {
    const result = selectAuthoritativeDailyPICandidates({
      piResult: piResult({ primary: [ranking(value)] }),
    });
    expect(result).toMatchObject({
      status: "selected",
      primary: { sourceClaimId: value.id },
      communicatedClaimIds: [value.id],
    });
  });

  it("renders an eligible Daily Training Energy relationship structurally", () => {
    const value = claim({
      domains: ["training", "energy"],
      kind: "training_energy_relationship",
    });
    value.explanationData.relationshipState =
      "training_progress_with_positive_energy_support";
    const result = selectAuthoritativeDailyPICandidates({
      piResult: piResult({ primary: [ranking(value)] }),
    });
    expect(renderDailyPICandidate(result.primary).interpretation).toContain(
      "Training improved while estimated Energy support remained positive."
    );
    expect(selectAuthoritativeDailyPICandidates({
      piResult: piResult({ primary: [ranking(value)] }),
      directTrainingNarrationActive: true,
    })).toMatchObject({
      status: "fallback",
      reason: "no_eligible_pi_primary",
    });
  });

  it("retains higher-authority event and unsupported-domain precedence", () => {
    expect(selectAuthoritativeDailyPICandidates({
      piResult: piResult(),
      higherAuthorityActive: true,
    })).toMatchObject({
      status: "fallback",
      reason: "unsupported_domain_legacy_fallback",
    });
  });

  it("requires exact inputs and never promotes fallback substitution", () => {
    expect(selectAuthoritativeDailyPICandidates({
      piResult: piResult({ weightMode: "fallback" }),
    })).toMatchObject({
      status: "fallback",
      reason: "exact_daily_inputs_unavailable",
    });
    const energyClaim = claim({
      domains: ["energy", "weight"],
      kind: "intake_weight_stability",
    });
    expect(selectAuthoritativeDailyPICandidates({
      piResult: piResult({
        energyMode: "fallback",
        primary: [ranking(energyClaim)],
      }),
    }).primary).toBeNull();
  });

  it("does not repeat an unchanged communicated claim but permits material lifecycle change", () => {
    const value = claim();
    expect(selectAuthoritativeDailyPICandidates({
      piResult: piResult({ primary: [ranking(value)] }),
      communicatedClaimIds: [value.id],
    })).toMatchObject({
      status: "fallback",
      reason: "no_eligible_pi_primary",
    });
    const strengthened = claim({ lifecycle: "strengthened" });
    expect(selectAuthoritativeDailyPICandidates({
      piResult: piResult({ primary: [ranking(strengthened)] }),
      communicatedClaimIds: [strengthened.id],
    }).status).toBe("selected");
  });

  it("preserves ranked supporting order and diversity without rescoring", () => {
    const support = claim({
      domains: ["energy", "weight"],
      kind: "intake_weight_stability",
    });
    const result = selectAuthoritativeDailyPICandidates({
      piResult: piResult({
        supporting: [ranking(support, {
          rank: 2,
          priorityScore: 60,
          selectionState: "supporting",
        })],
      }),
    });
    expect(result.supporting).toHaveLength(1);
    expect(result.supporting[0].provenance.ranking).toMatchObject({
      rank: 2,
      priorityScore: 60,
    });
  });

  it.each([
    ["low confidence", claim({ confidence: "low" })],
    ["background", claim({ lifecycle: "background" })],
    ["retired", claim({ lifecycle: "retired" })],
  ])("does not force a %s primary", (_name, value) => {
    expect(selectAuthoritativeDailyPICandidates({
      piResult: piResult({ primary: [ranking(value)] }),
    }).primary).toBeNull();
  });

  it("allows a ranked contradiction to lead without changing its meaning", () => {
    const value = claim({ confidence: "low", lifecycle: "contradicted" });
    const result = selectAuthoritativeDailyPICandidates({
      piResult: piResult({ primary: [ranking(value)] }),
    });
    expect(result.primary.sourceClaimId).toBe(value.id);
  });

  it.each([
    [null, "pi_validation_failed"],
    [{}, "pi_validation_failed"],
    [piResult({ primary: [] }), "no_eligible_pi_primary"],
  ])("falls back deterministically for invalid or weak selection", (input, reason) => {
    expect(selectAuthoritativeDailyPICandidates({
      piResult: input,
    }).reason).toBe(reason);
  });
});

describe("Daily PI candidate rendering", () => {
  it.each([
    ["training_progress_weight_stability", /improved.*remained stable/i],
    ["training_progress_weight_change", /improved.*weight increased/i],
    ["training_regression_weight_stability", /declined.*remained stable/i],
    ["training_volume_weight_change", /volume.*weight increased/i],
    ["intake_weight_stability", /intake increased.*remained stable/i],
    ["expenditure_weight_change", /expenditure increased.*weight increased/i],
    ["insufficient_energy_to_explain_weight", /not complete enough/i],
  ])("renders %s as a connected conservative relationship", (kind, pattern) => {
    const value = createDailyPINarrativeCandidate(ranking(claim({
      domains: kind.includes("energy") || kind.startsWith("intake") ||
        kind.startsWith("expenditure")
        ? ["energy", "weight"]
        : ["training", "weight"],
      kind,
    })));
    const rendered = renderDailyPICandidate(value);
    expect(rendered.interpretation).toMatch(pattern);
    expect(rendered.interpretation).not.toMatch(
      /\bPI\b|observation|semantic horizon|lifecycle|ranking|gained muscle|fat gain|recomp|proves|caused by/i
    );
  });

  it("carries material incompleteness into wording and emits no recommendation", () => {
    const candidate = createDailyPINarrativeCandidate(ranking(claim({
      limitations: ["paired_energy_coverage_incomplete"],
    })));
    expect(renderDailyPICandidate(candidate).interpretation).toMatch(
      /incomplete.*provisional/i
    );
    expect(candidate.recommendationEligible).toBe(false);
    expect(candidate).not.toHaveProperty("recommendation");
  });
});

describe("Daily production semantic integration boundary", () => {
  function weightEntry(index, value) {
    const day = String(index + 1).padStart(2, "0");
    return {
      id: `weight_${day}`,
      measuredAt: `2026-07-${day}`,
      weight: { value, unit: "lb" },
    };
  }

  function trainingSession(id, observedAt, load) {
    return {
      id,
      evidence_type: "training",
      observed_at: observedAt,
      metadata: { activity_type: "Traditional Strength Training" },
      exercises: [{
        exercise_id: "seated_cable_rows",
        name: "Seated Cable Rows",
        category: "Back",
        sets: [{ set_number: 1, weight: load, reps: 10 }],
      }],
    };
  }

  function integrationInput(overrides = {}) {
    const sortedWeights = Array.from({ length: 14 }, (_, index) =>
      weightEntry(index, index < 7 ? 165 : 165)
    );
    return {
      activeGoal: {
        id: "goal_build",
        type: "build_lean_mass",
        status: "active",
        primary: true,
        timeline: { startDate: "2026-07-01" },
        target: {
          type: "numeric_change",
          metric: "lean_mass",
          direction: "increase",
          amount: 10,
          unit: "lb",
        },
        progressMeasurement: {
          outcomeMeasures: [{
            id: "dexa_lean",
            evidenceType: "dexa_lean_mass",
            importance: "defining",
            accepted: true,
          }],
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
          ],
          explanatorySignals: [{
            id: "calories",
            evidenceType: "calories",
            importance: "contextual",
            accepted: true,
          }],
        },
        phases: [{
          id: "phase_1",
          status: "active",
          startDate: "2026-07-01",
        }],
      },
      evidenceWindow: {
        id: "daily:2026-07-14:America/Los_Angeles",
        cadence: "daily",
        briefingDate: "2026-07-15",
        date: "2026-07-14",
        start: "2026-07-14T00:00:00",
        end: "2026-07-14T23:59:59.999",
        timeZone: "America/Los_Angeles",
      },
      sortedWeights,
      weightStats: {
        weeklyAverage: 165,
        previousWeeklyAverage: 165,
        weekOverWeek: 0,
        unit: "lb",
      },
      trainingPerformanceReport:
        createTrainingPerformanceIntelligenceReport({
          generatedAt: "2026-07-15T12:00:00.000Z",
          now: "2026-07-15T12:00:00.000Z",
          trainingSessions: [
            trainingSession("training_1", "2026-07-01", 100),
            trainingSession("training_2", "2026-07-05", 105),
            trainingSession("training_3", "2026-07-10", 110),
            trainingSession("training_4", "2026-07-14", 115),
          ],
        }),
      ...overrides,
    };
  }

  it("selects ranked Training × Weight meaning at the explicit boundary", () => {
    const result = resolveAuthoritativeDailyPISelection(integrationInput({
      piResultOverride: piResult(),
    }));
    expect(result.status, JSON.stringify(result)).toBe("selected");
    expect(result.primary.candidateType).toMatch(/^training_/);
  });

  it("isolates malformed PI input and preserves deterministic fallback", () => {
    const result = resolveAuthoritativeDailyPISelection(integrationInput({
      trainingPerformanceReport: { observations: [{ invalid: true }] },
    }));
    expect(result).toMatchObject({
      status: "fallback",
      reason: "pi_validation_failed",
    });
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "daily_pi_authoritative_selection_failed",
      })
    );
  });

  it("preserves event precedence and communicated claim compatibility", () => {
    const selected = resolveAuthoritativeDailyPISelection(integrationInput({
      piResultOverride: piResult(),
    }));
    expect(resolveAuthoritativeDailyPISelection(integrationInput({
      higherAuthorityActive: true,
      piResultOverride: piResult(),
    })).reason).toBe("unsupported_domain_legacy_fallback");
    expect(resolveAuthoritativeDailyPISelection(integrationInput({
      briefingMemory: {
        communicatedClaimIds: selected.communicatedClaimIds,
      },
      piResultOverride: piResult(),
    })).reason).toBe("no_eligible_pi_primary");
  });
});
