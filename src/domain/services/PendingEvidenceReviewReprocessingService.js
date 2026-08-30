import { createHash } from "node:crypto";
import { reinterpretEvidenceIntakeSubmissionFromStoredArtifacts } from "./EvidenceIntakeService";
import { resolveTrainingExerciseIdentity } from "../models/trainingExerciseIdentity";
import { resolveExecutionVariantHeading } from "../models/trainingSessionEvidence";
import { remapTrainingExerciseRelationshipGroups } from "../models/trainingExerciseRelationship";
import { resolveEvidenceReviewReprocessEligibility } from "./EvidenceReviewReprocessEligibility";

// Increment intentionally when a parser correction should make retained pending
// evidence eligible for one new bounded interpretation.
export const PENDING_REVIEW_REPROCESS_VERSION = "pending-review-parser-v5";

export class PendingEvidenceReviewReprocessError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PendingEvidenceReviewReprocessError";
    this.code = code;
  }
}

export function createPendingEvidenceReviewReprocessingService({
  repositories,
  now = () => new Date(),
  reinterpret = reinterpretRetainedPackage,
  loadArtifact = null,
  version = PENDING_REVIEW_REPROCESS_VERSION,
} = {}) {
  return {
    async reprocessPendingReviewInPlace(reviewId) {
      const review = await repositories.evidenceReviews.getReviewById(reviewId);
      const packageId = review?.interpretedEvidence?.package_id;
      const persistedPackage = packageId
        ? await repositories.evidencePackages.getEvidencePackageById(packageId)
        : null;
      const evidencePackage = persistedPackage ?? resolveDedicatedDexaSourcePackage(review);
      const canonicalObjects = review && repositories.canonicalEvidence?.listCanonicalEvidenceObjects
        ? await repositories.canonicalEvidence.listCanonicalEvidenceObjects(review.userId)
        : [];
      const eligibility = resolveEvidenceReviewReprocessEligibility({
        review,
        evidencePackage,
        canonicalObjects,
      });
      if (!eligibility.eligible) fail(eligibility.code, eligibility.reason);
      assertNoUserCorrectedDexaCandidate(review);

      const sourceArtifactFingerprint = fingerprint(evidencePackage.provenance?.source_artifacts);
      const operationId = `reprocess_pending_review_in_place:${review.id}`;
      if (review.reprocessing?.status === "complete" && review.reprocessing.sourceArtifactFingerprint === sourceArtifactFingerprint && review.reprocessing.version === version) {
        return { review, idempotent: true, changed: false };
      }

      const claimedAt = now().toISOString();
      const priorCandidateFingerprint = fingerprint(review.interpretedEvidence);
      await repositories.evidenceReviews.claimPendingReviewReprocess(review.id, {
        operation: "reprocessPendingReviewInPlace", operationId, status: "in_progress", claimedAt,
        sourcePackageId: packageId, sourceArtifactFingerprint, version, priorCandidateFingerprint,
      });

      try {
        const fresh = await reinterpret({ evidencePackage, review, loadArtifact });
        assertReproducedCandidate(fresh);
        const interpretedEvidence = preserveCandidateImmutables(review.interpretedEvidence, evidencePackage, fresh);
        const completedAt = now().toISOString();
        const lifecycle = {
          operation: "reprocessPendingReviewInPlace", operationId, status: "complete", claimedAt, completedAt,
          sourcePackageId: packageId, sourceArtifactFingerprint, version, priorCandidateFingerprint,
          resultingCandidateFingerprint: fingerprint(interpretedEvidence),
        };
        const updated = await repositories.evidenceReviews.completePendingReviewReprocess(review.id, {
          interpretedEvidence,
          evidenceTypes: unique((interpretedEvidence.evidence_objects ?? []).map((item) => item.evidence_type)),
          lifecycle,
        });
        return { review: updated, idempotent: false, changed: true };
      } catch (error) {
        const failedAt = now().toISOString();
        await repositories.evidenceReviews.failPendingReviewReprocess(review.id, {
          operation: "reprocessPendingReviewInPlace", operationId, status: "failed", claimedAt, failedAt,
          sourcePackageId: packageId, sourceArtifactFingerprint, version, priorCandidateFingerprint,
          error: { code: error?.code ?? "REPROCESS_FAILED", message: String(error?.message ?? error).slice(0, 300) },
        });
        throw error;
      }
    },
  };
}

async function reinterpretRetainedPackage({ evidencePackage, review, loadArtifact }) {
  if (typeof loadArtifact !== "function") {
    fail(
      "PROVIDER_MEDIA_BINDING_UNAVAILABLE",
      "Retained evidence cannot be reread without an artifact loader."
    );
  }
  const result = await reinterpretEvidenceIntakeSubmissionFromStoredArtifacts({
    evidencePackage,
    expectedEvidenceType: evidencePackage.detected_evidence_type ?? "auto",
    loadArtifact,
    userId: review.userId,
  });
  return result.evidencePackage;
}

function preserveCandidateImmutables(previous, evidencePackage, fresh) {
  return {
    ...fresh,
    package_id: evidencePackage.package_id,
    captured_at: previous?.captured_at ?? evidencePackage.captured_at,
    observed_date: previous?.observed_date ?? evidencePackage.observed_date,
    userId: previous?.userId ?? evidencePackage.userId,
    provenance: structuredClone(evidencePackage.provenance),
    evidence_objects: (fresh.evidence_objects ?? []).map((object) =>
      preserveSourceDerivedObjectFields(object, previous?.evidence_objects, evidencePackage)
    ),
  };
}

function preserveSourceDerivedObjectFields(freshObject, previousObjects = [], evidencePackage = {}) {
  const prior = previousObjects.find((object) => sameEvidenceIdentity(object, freshObject));
  if (!prior) return freshObject;
  const exercises = preserveExerciseSetSemantics({
    freshExercises: freshObject.exercises,
    priorExercises: prior.exercises,
    typedEvidence: getTypedEvidence(evidencePackage),
  });
  const idMap = new Map(
    (freshObject.exercises ?? []).map((exercise, index) => [
      exercise?.id,
      exercises?.[index]?.id ?? exercise?.id,
    ])
  );
  const freshRelationshipGroups = remapTrainingExerciseRelationshipGroups(
    freshObject.exerciseRelationshipGroups,
    idMap
  );
  return {
    ...freshObject,
    captured_at: prior.captured_at ?? freshObject.captured_at,
    metadata: structuredClone(prior.metadata ?? freshObject.metadata),
    exercises,
    ...((freshRelationshipGroups?.length || prior.exerciseRelationshipGroups?.length)
      ? {
          exerciseRelationshipGroups: freshRelationshipGroups?.length
            ? freshRelationshipGroups
            : structuredClone(prior.exerciseRelationshipGroups),
        }
      : {}),
    ...((freshObject.structuralReviewIssues?.length || prior.structuralReviewIssues?.length)
      ? {
          structuralReviewIssues: freshObject.structuralReviewIssues?.length
            ? freshObject.structuralReviewIssues
            : structuredClone(prior.structuralReviewIssues),
        }
      : {}),
  };
}

function preserveExerciseSetSemantics({ freshExercises, priorExercises, typedEvidence }) {
  if (!Array.isArray(freshExercises) || !Array.isArray(priorExercises)) return freshExercises;

  return freshExercises.map((freshExercise, exerciseIndex) => {
    const priorExercise = priorExercises[exerciseIndex];
    const freshIdentity = resolveTrainingExerciseIdentity(freshExercise?.name);
    const priorIdentity = resolveTrainingExerciseIdentity(priorExercise?.name);
    const sameCanonicalExercise = Boolean(
      freshIdentity.canonicalExerciseId &&
      freshIdentity.canonicalExerciseId === priorIdentity.canonicalExerciseId
    );
    const sameSetCount =
      Array.isArray(freshExercise?.sets) &&
      Array.isArray(priorExercise?.sets) &&
      freshExercise.sets.length === priorExercise.sets.length;
    const sourceBlock = getExerciseSourceBlock(typedEvidence, freshIdentity.canonicalExerciseId);
    const blocksBodyweightNormalization = hasWeightedOrAssistedSignal(sourceBlock);
    const bodyweightOnlyIdentity = freshIdentity.exercise?.default_load_type === "bodyweight";
    const explicitBodyweightSource = /\bbody\s*weight\b|\bbodyweight\b|\bbw\b/i.test(sourceBlock);
    const executionVariant = freshExercise.executionVariant ??
      (sameCanonicalExercise ? priorExercise?.executionVariant : null);

    return {
      ...freshExercise,
      id: sameCanonicalExercise ? priorExercise.id ?? freshExercise.id : freshExercise.id,
      ...(executionVariant ? { executionVariant: structuredClone(executionVariant) } : {}),
      sets: (freshExercise?.sets ?? []).map((freshSet, setIndex) => {
        if (!isZeroExternalLoad(freshSet) || blocksBodyweightNormalization) return freshSet;

        const priorSet = sameCanonicalExercise && sameSetCount
          ? priorExercise.sets[setIndex]
          : null;
        const semanticallyEquivalentPriorBodyweight =
          isBodyweightSet(priorSet) &&
          sameSetSemantics(priorSet, freshSet);

        if (!explicitBodyweightSource && !bodyweightOnlyIdentity && !semanticallyEquivalentPriorBodyweight) {
          return freshSet;
        }

        return {
          ...freshSet,
          load_type: "bodyweight",
          measurement_type: "bodyweight_reps",
          set_type: "bodyweight_reps",
          weight: null,
          weight_unit: null,
          volume: null,
        };
      }),
    };
  });
}

function getTypedEvidence(evidencePackage) {
  return (evidencePackage.provenance?.source_artifacts ?? [])
    .filter((artifact) => artifact.kind === "typed_evidence" && artifact.text)
    .map((artifact) => artifact.text)
    .join("\n\n");
}

function getExerciseSourceBlock(typedEvidence, canonicalExerciseId) {
  if (!typedEvidence || !canonicalExerciseId) return "";
  const lines = String(typedEvidence).split(/\r?\n/);
  const start = lines.findIndex(
    (line) => getSourceHeadingCanonicalExerciseId(line) === canonicalExerciseId
  );
  if (start < 0) return "";
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (getSourceHeadingCanonicalExerciseId(lines[index])) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

function getSourceHeadingCanonicalExerciseId(line) {
  const source = String(line ?? "").trim();
  return resolveTrainingExerciseIdentity(source).canonicalExerciseId ??
    resolveExecutionVariantHeading(source)?.baseIdentity?.canonicalExerciseId ??
    null;
}

function hasWeightedOrAssistedSignal(sourceBlock) {
  if (/\bassist(?:ed|ance)?\b|\bcounterbalance(?:d)?\b/i.test(sourceBlock)) return true;
  return [...String(sourceBlock).matchAll(
    /\b(?:added|additional|weighted|with)\s+(\d+(?:\.\d+)?)\s*(?:lb|lbs|pounds?|kg)\b/gi
  )].some((match) => Number(match[1]) > 0);
}

function isZeroExternalLoad(set) {
  return (
    Number(set?.weight ?? set?.load) === 0 &&
    set?.load_type !== "bodyweight" &&
    set?.weight_unit !== "bodyweight"
  );
}

function isBodyweightSet(set) {
  return (
    set?.load_type === "bodyweight" &&
    (set?.weight === null || set?.weight === undefined) &&
    (set?.weight_unit === null || set?.weight_unit === undefined || set?.weight_unit === "bodyweight")
  );
}

function sameSetSemantics(left, right) {
  return (
    Number(left?.set_number) === Number(right?.set_number) &&
    nullableNumber(left?.reps) === nullableNumber(right?.reps) &&
    nullableNumber(left?.duration_seconds) === nullableNumber(right?.duration_seconds)
  );
}

function nullableNumber(value) {
  return value === null || value === undefined ? null : Number(value);
}

function sameEvidenceIdentity(left, right) {
  return left?.evidence_type === right?.evidence_type
    && left?.observed_at === right?.observed_at
    && normalizeIdentity(left?.metadata?.activity_type ?? left?.id) === normalizeIdentity(right?.metadata?.activity_type ?? right?.id);
}

function normalizeIdentity(value) { return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }

function assertNoUserCorrectedDexaCandidate(review) {
  const correctedDexa = (review.interpretedEvidence?.evidence_objects ?? []).find(
    (object) =>
      ["dexa_scan", "dexa", "body_composition"].includes(object.evidence_type) &&
      object.parser_confidence === "user_corrected"
  );
  if (correctedDexa) {
    fail(
      "DEXA_REPROCESS_USER_CORRECTIONS_PRESENT",
      "Reprocessing cannot replace DEXA measurements that the user already corrected."
    );
  }
}

function resolveDedicatedDexaSourcePackage(review) {
  if (review?.source !== "dedicated_dexa") return null;
  if (review.interpretedEvidence?.package_id &&
      Array.isArray(review.interpretedEvidence?.provenance?.source_artifacts)) {
    return structuredClone(review.interpretedEvidence);
  }
  return null;
}

function assertReproducedCandidate(candidate) {
  if (!candidate || candidate.quality?.status === "failed" || !(candidate.evidence_objects ?? []).length) {
    fail("INTERPRETATION_INCOMPLETE", "The retained evidence could not reproduce a review candidate.");
  }
}

function fingerprint(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function unique(values) { return [...new Set(values.filter(Boolean))]; }
function fail(code, message) { throw new PendingEvidenceReviewReprocessError(code, message); }
