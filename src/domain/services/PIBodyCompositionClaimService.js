import {
  createPICrossDomainClaim,
  validatePICrossDomainClaim,
} from "./PICrossDomainClaimService";
import { validatePIObservation } from "./PIObservationService";

export const PI_BODY_COMPOSITION_CLAIM_VERSION = "pi_body_composition_claims_v1";
export const PI_EVIDENCE_AUTHORITY = Object.freeze({
  dexa: 6,
  repeated_comparable_photos: 5,
  comparable_photo: 4,
  weight: 3,
  energy: 2,
  training: 1,
});

export function createBodyCompositionClaims(observations = []) {
  if (!Array.isArray(observations)) throw new Error("observations must be an array.");
  observations.forEach(validatePIObservation);
  const byKind = (kind) => observations.filter((item) => item.kind === kind);
  const claims = [];
  pairFirst(byKind("dexa_lean_mass_change"), observations.filter((item) => item.domain === "training" && measurable(item)), (dexa, training) =>
    relationshipClaim("dexa_lean_mass_training_relationship", [dexa, training], {
      relationship: "dexa_lean_mass_with_training",
      corroborationState: directionalAgreement(dexa, training) ? "corroborated" : "uncorroborated",
      authority: authoritySummary([dexa, training]),
    })
  , claims);
  pairFirst(byKind("dexa_body_fat_percentage_change"), observations.filter((item) => item.domain === "weight" && measurable(item)), (dexa, weight) =>
    relationshipClaim("dexa_body_fat_weight_relationship", [dexa, weight], {
      relationship: "dexa_body_fat_with_weight",
      corroborationState: directionalAgreement(dexa, weight) ? "corroborated" : "contradicted",
      authority: authoritySummary([dexa, weight]),
      authoritativeObservationId: dexa.id,
    })
  , claims);
  pairFirst(byKind("photo_leanness_change"), observations.filter((item) => item.domain === "weight" && measurable(item)), (photo, weight) =>
    relationshipClaim("photo_leanness_weight_relationship", [photo, weight], {
      relationship: "photo_leanness_with_weight",
      corroborationState: photoWeightAgreement(photo, weight) ? "partially_corroborated" : "uncorroborated",
      authority: authoritySummary([photo, weight]),
    }, ["photos_are_directional_not_measurement"])
  , claims);
  pairFirst(byKind("photo_leanness_change"), byKind("dexa_body_fat_percentage_change"), (photo, dexa) => {
    const agrees = photoDexaAgreement(photo, dexa);
    return relationshipClaim("photo_dexa_body_fat_corroboration", [photo, dexa], {
      relationship: "photo_leanness_with_dexa_body_fat",
      corroborationState: agrees ? "corroborated" : "contradicted",
      authority: authoritySummary([photo, dexa]),
      authoritativeObservationId: dexa.id,
      lowerAuthorityObservationId: photo.id,
    }, agrees ? [] : ["photo_direction_disagrees_with_dexa_measurement"]);
  }, claims);
  for (const dexa of observations.filter((item) => item.domain === "dexa" && measurable(item))) {
    const lower = observations.filter((item) => ["weight", "energy", "training"].includes(item.domain) && measurable(item));
    if (!lower.length) continue;
    const selected = lower.sort((a, b) => authority(b) - authority(a) || a.id.localeCompare(b.id))[0];
    claims.push(relationshipClaim("dexa_body_composition_confirmation", [dexa, selected], {
      relationship: "dexa_confirmation_of_lower_authority_context",
      corroborationState: directionalAgreement(dexa, selected) ? "corroborated" : "contradicted",
      authority: authoritySummary([dexa, selected]),
      authoritativeObservationId: dexa.id,
      lowerAuthorityObservationId: selected.id,
    }));
  }
  const unique = [...new Map(claims.map((claim) => [claim.id, claim])).values()]
    .sort((left, right) => left.id.localeCompare(right.id));
  unique.forEach(validatePICrossDomainClaim);
  return unique;
}

function relationshipClaim(kind, participants, explanationData, extraLimitations = []) {
  const limitations = [...new Set([
    ...participants.flatMap((item) => item.confidence.limitations ?? []),
    ...extraLimitations,
  ])].sort();
  const weakest = participants.map((item) => item.confidence.level)
    .sort((a, b) => confidenceIndex(a) - confidenceIndex(b))[0];
  const scope = [...new Set(participants.map((item) => semanticScope(item)))].sort().join(".");
  return createPICrossDomainClaim({
    kind,
    semanticScope: scope || "body_composition",
    participatingObservationIds: participants.map((item) => item.id),
    participatingDomains: participants.map((item) => item.domain),
    evidenceWindow: combinedWindow(participants),
    confidence: {
      level: limitations.length ? lowerConfidence(weakest) : weakest,
      score: null,
      reasons: [`weakest_participant_${weakest}`, "evidence_authority_applied"],
      factors: participants.map((item) => ({ observationId: item.id, level: item.confidence.level, authority: authority(item) })),
      limitations,
      method: "body_composition_authority_and_weakest_participant",
    },
    materiality: { level: "unevaluated", score: null, basis: [], method: "shared_ranking_pending" },
    explanationData: {
      ...explanationData,
      participantDirections: participants.map((item) => ({ observationId: item.id, domain: item.domain, direction: item.direction })),
      causalInference: false,
      goalConclusion: null,
      limitations,
    },
    provenance: {
      producer: "pi_body_composition_claim_service",
      producerVersion: PI_BODY_COMPOSITION_CLAIM_VERSION,
      calculationMethod: "structured_body_composition_relationship",
      sourceObservationIds: participants.map((item) => item.id),
      producerChain: participants.map((item) => ({
        observationId: item.id,
        producer: item.provenance.producer,
        producerVersion: item.provenance.producerVersion,
      })),
    },
    limitations,
  });
}

function pairFirst(left, right, factory, output) {
  if (left[0] && right[0]) output.push(factory(left[0], right[0]));
}
function measurable(item) { return !["insufficient_data", "unknown"].includes(item.status); }
function semanticScope(item) { return item.id.split("|").at(-1) ?? "body_composition"; }
function directionalAgreement(left, right) { return left.direction === right.direction || left.direction === "stable" && right.direction === "stable"; }
function photoWeightAgreement(photo, weight) {
  return photo.direction === "stable" || photo.direction === "rising" && weight.direction !== "falling" || photo.direction === "falling" && weight.direction !== "rising";
}
function photoDexaAgreement(photo, dexa) {
  return photo.direction === "stable" && dexa.direction === "stable" ||
    photo.direction === "rising" && dexa.direction === "falling" ||
    photo.direction === "falling" && dexa.direction === "rising";
}
function authority(item) {
  if (item.domain === "dexa") return PI_EVIDENCE_AUTHORITY.dexa;
  if (item.domain === "photos") return Number(item.explanationData?.repeatedDirectionCount) >= 2 ? PI_EVIDENCE_AUTHORITY.repeated_comparable_photos : PI_EVIDENCE_AUTHORITY.comparable_photo;
  return PI_EVIDENCE_AUTHORITY[item.domain] ?? 0;
}
function authoritySummary(items) {
  return items.map((item) => ({ observationId: item.id, domain: item.domain, level: authority(item) }))
    .sort((a, b) => b.level - a.level || a.observationId.localeCompare(b.observationId));
}
function combinedWindow(items) {
  const dates = items.flatMap((item) => [
    item.evidenceWindow.startDate,
    item.evidenceWindow.endDate,
    item.evidenceWindow.comparisonStartDate,
    item.evidenceWindow.comparisonEndDate,
  ]).filter(Boolean).sort();
  return { startDate: dates[0] ?? null, endDate: dates.at(-1) ?? null };
}
function confidenceIndex(value) { return ["unevaluated", "low", "moderate", "high", "very_high"].indexOf(value); }
function lowerConfidence(value) {
  const values = ["unevaluated", "low", "moderate", "high", "very_high"];
  return values[Math.max(0, confidenceIndex(value) - 1)];
}
