import {
  isPICrossDomainClaim,
  normalizePICrossDomainClaim,
} from "./PICrossDomainClaimService";
import {
  PI_NARRATIVE_CANDIDATE_SCHEMA_VERSION,
  normalizePINarrativeCandidate,
  validatePINarrativeCandidate,
} from "./PINarrativeCandidateService";

export const PI_BRIEFING_MEMORY_SCHEMA_VERSION = "pi_briefing_memory_v1";
export const PI_BRIEFING_MEMORY_BOUNDS = Object.freeze({
  communicatedClaimIds: 24,
  claimHistory: 48,
  priorClaims: 12,
  trainingPRClaimIds: 24,
});
const CADENCES = new Set(["midweek", "weekly"]);

export function createPIBriefingMemory(input = {}) {
  const before = structuredClone(input);
  const cadence = requiredCadence(input.cadence);
  const briefingDate = requiredDate(input.briefingDate);
  const memory = normalizeFields({
    schemaVersion: PI_BRIEFING_MEMORY_SCHEMA_VERSION,
    cadence,
    briefingDate,
    communicatedClaimIds: input.communicatedClaimIds,
    claimHistory: input.claimHistory,
    priorClaims: input.priorClaims,
    trainingPRClaimIds: input.trainingPRClaimIds,
    limitations: input.limitations,
  });
  if (JSON.stringify(input) !== JSON.stringify(before)) {
    throw new Error("PI briefing memory input mutation detected.");
  }
  return deepFreeze({
    ...memory,
    provenance: {
      producer: "pi_briefing_memory_service",
      producerVersion: PI_BRIEFING_MEMORY_SCHEMA_VERSION,
      bounded: true,
      proseStored: false,
    },
  });
}

export function normalizePIBriefingMemory(value, { cadence = null } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value.schemaVersion !== PI_BRIEFING_MEMORY_SCHEMA_VERSION) return null;
  if (!CADENCES.has(value.cadence) || cadence && value.cadence !== cadence) {
    return null;
  }
  try {
    return createPIBriefingMemory(value);
  } catch {
    return null;
  }
}

export function validatePIBriefingMemory(value) {
  const normalized = normalizePIBriefingMemory(value);
  if (!normalized) throw new Error("Invalid PI briefing memory.");
  return true;
}

export function isPIBriefingMemory(value) {
  return normalizePIBriefingMemory(value) != null;
}

export function mergePIBriefingMemory(
  previousMemory,
  currentEvaluation,
  { cadence, briefingDate } = {}
) {
  const previous = normalizePIBriefingMemory(previousMemory, { cadence });
  const current = currentEvaluation ?? {};
  return createPIBriefingMemory({
    cadence,
    briefingDate,
    communicatedClaimIds: [
      ...(previous?.communicatedClaimIds ?? []),
      ...(current.communicatedClaimIds ?? []),
    ],
    claimHistory: [
      ...(previous?.claimHistory ?? []),
      ...(current.communicatedClaimIds ?? []).map((claimId) => ({
        claimId,
        communicatedAt: briefingDate,
        lifecycleState:
          current.claims?.find((claim) => claim.id === claimId)?.lifecycle?.state ??
          null,
      })),
    ],
    priorClaims: current.claims ?? previous?.priorClaims ?? [],
    trainingPRClaimIds: [
      ...(previous?.trainingPRClaimIds ?? []),
      ...(current.trainingPRClaimIds ?? []),
    ],
    limitations: [
      ...(previous?.limitations ?? []),
      ...(current.limitations ?? []),
    ],
  });
}

function normalizeFields(input) {
  return {
    schemaVersion: PI_BRIEFING_MEMORY_SCHEMA_VERSION,
    cadence: input.cadence,
    briefingDate: input.briefingDate,
    communicatedClaimIds: evictIds(
      input.communicatedClaimIds,
      PI_BRIEFING_MEMORY_BOUNDS.communicatedClaimIds
    ),
    claimHistory: evictHistory(
      input.claimHistory,
      PI_BRIEFING_MEMORY_BOUNDS.claimHistory
    ),
    priorClaims: evictClaims(
      input.priorClaims,
      PI_BRIEFING_MEMORY_BOUNDS.priorClaims
    ),
    trainingPRClaimIds: evictIds(
      input.trainingPRClaimIds,
      PI_BRIEFING_MEMORY_BOUNDS.trainingPRClaimIds
    ),
    limitations: uniqueStrings(input.limitations).slice(-12),
  };
}

function evictIds(values, limit) {
  return uniqueStrings(values).slice(-limit);
}

function evictHistory(values, limit) {
  if (!Array.isArray(values)) return [];
  const normalized = values
    .filter((entry) => entry && typeof entry.claimId === "string")
    .map((entry) => ({
      claimId: entry.claimId,
      communicatedAt: validDate(entry.communicatedAt) ? entry.communicatedAt : null,
      lifecycleState:
        typeof entry.lifecycleState === "string" ? entry.lifecycleState : null,
    }));
  const unique = new Map(
    normalized.map((entry) => [
      `${entry.communicatedAt ?? ""}|${entry.claimId}|${entry.lifecycleState ?? ""}`,
      entry,
    ])
  );
  return [...unique.values()]
    .sort((left, right) =>
      `${left.communicatedAt ?? ""}|${left.claimId}`.localeCompare(
        `${right.communicatedAt ?? ""}|${right.claimId}`
      )
    )
    .slice(-limit);
}

function evictClaims(values, limit) {
  if (!Array.isArray(values)) return [];
  const normalized = values
    .map((value) => {
      if (isPICrossDomainClaim(value)) return minimalClaimSnapshot(value);
      try {
        validatePINarrativeCandidate(value);
        return minimalCandidateSnapshot(value);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  const byId = new Map(normalized.map((claim) => [claim.id, claim]));
  return [...byId.values()]
    .sort((left, right) =>
      `${claimDate(left)}|${left.id}`.localeCompare(
        `${claimDate(right)}|${right.id}`
      )
    )
    .slice(-limit);
}

function minimalCandidateSnapshot(value) {
  const candidate = normalizePINarrativeCandidate(value);
  return {
    id: candidate.id,
    schemaVersion: PI_NARRATIVE_CANDIDATE_SCHEMA_VERSION,
    candidateType: candidate.candidateType,
    sourceType: candidate.sourceType,
    sourceId: candidate.sourceId,
    semanticFamily: candidate.semanticFamily,
    semanticScope: candidate.semanticScope,
    participatingDomains: [...candidate.participatingDomains],
    thesisDomain: candidate.thesisDomain,
    relationshipKind: candidate.relationshipKind,
    status: candidate.status,
    direction: candidate.direction,
    confidence: structuredClone(candidate.confidence),
    materiality: structuredClone(candidate.materiality),
    goalContext: structuredClone(candidate.goalContext),
    lifecycle: structuredClone(candidate.lifecycle),
    evidenceWindow: structuredClone(candidate.evidenceWindow),
    supportingEvidenceIds: [...candidate.supportingEvidenceIds],
    coverage: structuredClone(candidate.coverage),
    limitations: [...candidate.limitations],
    explanationData: {
      comparison: candidate.explanationData.comparison
        ? {
            intake: {
              direction: candidate.explanationData.comparison.intake?.direction,
            },
            estimatedExpenditure: {
              direction:
                candidate.explanationData.comparison.estimatedExpenditure
                  ?.direction,
            },
            netBalance: {
              direction:
                candidate.explanationData.comparison.netBalance?.direction,
            },
          }
        : null,
    },
    provenance: {
      producer: "pi_briefing_memory_service",
      sourceCandidateProducer: candidate.provenance.producer ?? null,
    },
  };
}

function minimalClaimSnapshot(value) {
  const claim = normalizePICrossDomainClaim(value);
  return {
    id: claim.id,
    schemaVersion: claim.schemaVersion,
    kind: claim.kind,
    participatingObservationIds: [...claim.participatingObservationIds],
    participatingDomains: [...claim.participatingDomains],
    evidenceWindow: structuredClone(claim.evidenceWindow),
    confidence: structuredClone(claim.confidence),
    materiality: structuredClone(claim.materiality),
    explanationData: {
      relationship: claim.explanationData.relationship ?? null,
      trainingDirection: claim.explanationData.trainingDirection ?? null,
      trainingStatus: claim.explanationData.trainingStatus ?? null,
      energyDirection: claim.explanationData.energyDirection ?? null,
      weightDirection: claim.explanationData.weightDirection ?? null,
      coverage: structuredClone(claim.explanationData.coverage ?? {}),
      evidenceOverlap: claim.explanationData.evidenceOverlap ?? null,
      trainingSubject: structuredClone(
        claim.explanationData.trainingSubject ?? null
      ),
      goalContext: structuredClone(claim.explanationData.goalContext ?? null),
    },
    provenance: structuredClone(claim.provenance),
    limitations: [...claim.limitations],
    ...(value.lifecycle ? { lifecycle: structuredClone(value.lifecycle) } : {}),
  };
}

function claimDate(claim) {
  return claim.lifecycle?.lastObservedDate ?? claim.evidenceWindow.endDate;
}
function requiredCadence(value) {
  if (!CADENCES.has(value)) throw new Error("PI briefing memory cadence is invalid.");
  return value;
}
function requiredDate(value) {
  if (!validDate(value)) throw new Error("PI briefing memory date is invalid.");
  return value;
}
function validDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
function uniqueStrings(values) {
  return [...new Set(
    (Array.isArray(values) ? values : []).filter(
      (value) => typeof value === "string" && value.length > 0
    )
  )];
}
function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
