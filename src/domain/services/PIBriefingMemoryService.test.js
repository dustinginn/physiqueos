import { describe, expect, it } from "vitest";
import { createPICrossDomainClaim } from "./PICrossDomainClaimService";
import {
  PI_BRIEFING_MEMORY_BOUNDS,
  PI_BRIEFING_MEMORY_SCHEMA_VERSION,
  createPIBriefingMemory,
  isPIBriefingMemory,
  mergePIBriefingMemory,
  normalizePIBriefingMemory,
  validatePIBriefingMemory,
} from "./PIBriefingMemoryService";
import { createPIObservationNarrativeCandidate } from "./PINarrativeCandidateService";
import { createPIObservation } from "./PIObservationService";

function claim(index = 0) {
  return createPICrossDomainClaim({
    kind: "energy_balance_weight_change",
    participatingObservationIds: [`e-${index}`, `w-${index}`],
    participatingDomains: ["energy", "weight"],
    semanticScope: `weekly.scope_${index}`,
    evidenceWindow: {
      startDate: "2026-07-19",
      endDate: `2026-07-${String(20 + index).padStart(2, "0")}`,
    },
    confidence: {
      level: "moderate",
      score: 60,
      reasons: ["paired"],
      factors: [],
      limitations: [],
      method: "test_confidence",
    },
    materiality: {
      level: "moderate",
      score: 50,
      basis: ["change"],
      method: "test_materiality",
    },
    explanationData: {
      relationship: "energy_balance_and_weight",
      energyDirection: "falling",
      weightDirection: "stable",
      coverage: { state: "complete" },
      evidenceOverlap: "complete",
    },
    provenance: {
      producer: "test",
      producerVersion: "v1",
      calculationMethod: "test_claim",
      sourceObservationIds: [`e-${index}`, `w-${index}`],
      producerChain: [],
    },
    limitations: [],
  });
}

describe("PIBriefingMemoryService", () => {
  it("creates a minimal versioned JSON-safe cadence memory", () => {
    const input = {
      cadence: "midweek",
      briefingDate: "2026-07-22",
      communicatedClaimIds: ["c1"],
      claimHistory: [{ claimId: "c1", communicatedAt: "2026-07-22" }],
      priorClaims: [claim()],
      trainingPRClaimIds: ["pr1"],
    };
    const before = structuredClone(input);
    const result = createPIBriefingMemory(input);
    expect(result).toMatchObject({
      schemaVersion: PI_BRIEFING_MEMORY_SCHEMA_VERSION,
      cadence: "midweek",
      communicatedClaimIds: ["c1"],
      trainingPRClaimIds: ["pr1"],
    });
    expect(result).not.toHaveProperty("observations");
    expect(result).not.toHaveProperty("rankingResult");
    expect(JSON.stringify(result)).not.toMatch(/renderedNarrative|recommendation/);
    expect(result.provenance.proseStored).toBe(false);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(input).toEqual(before);
    expect(validatePIBriefingMemory(result)).toBe(true);
  });

  it("normalizes missing, malformed, unsupported, and cross-cadence memory safely", () => {
    expect(normalizePIBriefingMemory(null)).toBeNull();
    expect(normalizePIBriefingMemory({ schemaVersion: "future" })).toBeNull();
    const valid = createPIBriefingMemory({
      cadence: "weekly",
      briefingDate: "2026-07-26",
    });
    expect(normalizePIBriefingMemory(valid, { cadence: "midweek" })).toBeNull();
    expect(isPIBriefingMemory({})).toBe(false);
  });

  it("enforces deterministic oldest-first bounds", () => {
    const claims = Array.from({ length: 15 }, (_, index) => claim(index));
    const result = createPIBriefingMemory({
      cadence: "weekly",
      briefingDate: "2026-08-09",
      communicatedClaimIds: Array.from({ length: 30 }, (_, i) => `c${i}`),
      claimHistory: Array.from({ length: 55 }, (_, i) => ({
        claimId: `h${i}`,
        communicatedAt: `2026-07-${String(i % 28 + 1).padStart(2, "0")}`,
      })),
      priorClaims: claims,
      trainingPRClaimIds: Array.from({ length: 30 }, (_, i) => `p${i}`),
    });
    expect(result.communicatedClaimIds).toHaveLength(
      PI_BRIEFING_MEMORY_BOUNDS.communicatedClaimIds
    );
    expect(result.claimHistory).toHaveLength(
      PI_BRIEFING_MEMORY_BOUNDS.claimHistory
    );
    expect(result.priorClaims).toHaveLength(
      PI_BRIEFING_MEMORY_BOUNDS.priorClaims
    );
    expect(result.trainingPRClaimIds).toHaveLength(
      PI_BRIEFING_MEMORY_BOUNDS.trainingPRClaimIds
    );
    expect(JSON.stringify(result).length).toBeLessThan(30000);
  });

  it("merges successful evaluation without storing full PI output", () => {
    const current = claim();
    const result = mergePIBriefingMemory(null, {
      communicatedClaimIds: [current.id],
      claims: [current],
      trainingPRClaimIds: ["pr"],
    }, {
      cadence: "midweek",
      briefingDate: "2026-07-22",
    });
    expect(result.communicatedClaimIds).toEqual([current.id]);
    expect(result.claimHistory[0]).toMatchObject({
      claimId: current.id,
      communicatedAt: "2026-07-22",
    });
    expect(result.priorClaims[0].id).toBe(current.id);
    expect(result.priorClaims[0]).not.toHaveProperty("ranking");
  });

  it("round-trips a compact generalized candidate through priorClaims", () => {
    const observation = createPIObservation({
      id: "performance|overall|resistance",
      domain: "training",
      kind: "training_performance",
      subject: { type: "training_scope", id: "resistance", label: "Resistance" },
      status: "improving",
      direction: "positive",
      evidenceWindow: { startDate: "2026-07-01", endDate: "2026-07-21" },
      supportingEvidenceIds: ["session"],
      confidence: {
        level: "high", score: 80, reasons: [], factors: [], limitations: [],
        method: "training_session_count",
      },
      materiality: {
        level: "high", score: 70, basis: [], method: "training_change",
      },
      explanationData: { representative: true },
      provenance: {
        producer: "test", producerVersion: "v1", calculationMethod: "test",
        sourceEvidenceIds: ["session"], sourceObservationIds: [],
        producerChain: [],
      },
    });
    const candidate = createPIObservationNarrativeCandidate({ observation });
    const memory = createPIBriefingMemory({
      cadence: "midweek",
      briefingDate: "2026-07-22",
      priorClaims: [candidate],
    });
    expect(memory.priorClaims[0]).toMatchObject({
      id: candidate.id,
      schemaVersion: "pi_narrative_candidate_v1",
      candidateType: "direct_training",
    });
    expect(memory.priorClaims[0].explanationData).not.toHaveProperty("subject");
  });
});
