import { createHash } from "node:crypto";
import { ApplicationProblem } from "../../contracts/v1/problem.js";

export const NATIVE_WEIGHT_CANDIDATE_SCHEMA_VERSION = "1";
export const NATIVE_WEIGHT_PARSER_SCHEMA_VERSION = "1";

export function createNativeSandboxWeightCandidateService({
  authority,
  store,
  media,
  clock = () => new Date(),
  performanceClock = () => performance.now(),
  logger = null,
} = {}) {
  if (!authority?.requirePrincipal || !store?.begin || !store?.stage ||
      !store?.getReview || !store?.confirm || !store?.discard || !media?.store) {
    throw new Error("Native sandbox Weight intake dependencies are required.");
  }

  return Object.freeze({
    async submit({ principal, submission, asset, requestId = null }) {
      const actor = authority.requirePrincipal(principal, "founder:write");
      const validationStartedAt = performanceClock();
      const candidate = validateSubmission(submission);
      const file = validateAsset(asset, candidate.assetSha256);
      observe(logger, "native.sandbox.weight_candidate.validated", {
        requestId,
        authorityId: authority.descriptor.authorityId,
        disposition: candidate.disposition,
        durationMs: elapsed(performanceClock, validationStartedAt),
      });
      const begun = await store.begin({
        authority: authority.descriptor,
        ownerUserId: actor.userId,
        submissionIdentity: candidate.submissionIdentity,
        idempotencyKey: candidate.idempotencyKey,
        candidate,
      });
      if (begun.outcome === "existing") return begun.review;

      const mediaStartedAt = performanceClock();
      const stored = await media.store({
        ownerUserId: actor.userId,
        bytes: file.bytes,
        contentType: file.contentType,
        originalFilename: file.filename,
        category: "evidenceIntakes",
        relationshipId: begun.intakeId,
        artifactId: `artifact_${candidate.submissionIdentity.replaceAll("-", "")}_1`,
      });
      observe(logger, "native.sandbox.weight_candidate.media_stored", {
        requestId,
        authorityId: authority.descriptor.authorityId,
        durationMs: elapsed(performanceClock, mediaStartedAt),
      });
      const review = createPendingWeightReview({
        authority: authority.descriptor,
        ownerUserId: actor.userId,
        intakeId: begun.intakeId,
        candidate,
        stored,
        at: clock().toISOString(),
      });
      const persistenceStartedAt = performanceClock();
      const staged = await store.stage({
        authority: authority.descriptor,
        ownerUserId: actor.userId,
        intakeId: begun.intakeId,
        idempotencyKey: candidate.idempotencyKey,
        candidate,
        review,
      });
      observe(logger, "native.sandbox.weight_candidate.evidence_review_ready", {
        requestId,
        authorityId: authority.descriptor.authorityId,
        status: staged.status,
        durationMs: elapsed(performanceClock, persistenceStartedAt),
      });
      return staged;
    },

    async getReview({ principal, reviewId }) {
      const actor = authority.requirePrincipal(principal, "founder:read");
      return authority.assertOwnedRecord(await store.getReview({ ownerUserId: actor.userId, reviewId }));
    },

    async confirm({ principal, reviewId, expectedVersion, correctedValue = null, correctedUnit = null, requestId = null }) {
      const actor = authority.requirePrincipal(principal, "founder:write");
      const review = await store.getReview({ ownerUserId: actor.userId, reviewId });
      if (!review) throw unavailable();
      authority.assertOwnedRecord(review);
      if (review.status !== "pending") throw conflict("The Weight review is no longer pending.");
      const value = correctedValue == null ? review.candidate.value : validWeight(correctedValue);
      const unit = correctedUnit == null ? review.candidate.unit : validUnit(correctedUnit);
      const measuredAt = review.candidate.measurementDate;
      const at = clock().toISOString();
      const weightEntry = Object.freeze({
        id: `weight_${review.submissionIdentity.replaceAll("-", "")}`,
        userId: actor.userId,
        measuredAt,
        weight: Object.freeze({ value, unit }),
        source: Object.freeze({ type: "evidence_review", confidence: "high" }),
        evidenceReviewId: review.id,
        createdAt: at,
        updatedAt: at,
      });
      const continuation = authority.envelopeOutbox({
        topic: "native.sandbox.weight.confirmed",
        dedupeKey: `weight:${review.id}:v${expectedVersion}`,
        payload: { reviewId: review.id, weightEntryId: weightEntry.id, measurementDate: measuredAt },
      });
      const commitStartedAt = performanceClock();
      const result = await store.confirm({
        authority: authority.descriptor,
        ownerUserId: actor.userId,
        reviewId,
        expectedVersion,
        weightEntry,
        continuation,
        confirmedAt: at,
      });
      observe(logger, "native.sandbox.weight_review.canonical_commit_and_outbox_enqueued", {
        requestId,
        authorityId: authority.descriptor.authorityId,
        durationMs: elapsed(performanceClock, commitStartedAt),
      });
      return result;
    },

    async discard({ principal, reviewId, expectedVersion }) {
      const actor = authority.requirePrincipal(principal, "founder:write");
      return store.discard({
        authority: authority.descriptor,
        ownerUserId: actor.userId,
        reviewId,
        expectedVersion,
        discardedAt: clock().toISOString(),
      });
    },
  });
}

export function validateNativeWeightCandidate(input) {
  return validateSubmission(input);
}

function validateSubmission(input = {}) {
  const submissionIdentity = String(input.submissionIdentity ?? "").trim();
  const idempotencyKey = String(input.idempotencyKey ?? "").trim();
  if (!uuid(submissionIdentity) || !/^[A-Za-z0-9._:-]{8,120}$/.test(idempotencyKey)) {
    throw invalid("The Weight submission identity is invalid.");
  }
  const measurementDate = calendarDate(input.measurementDate);
  const value = validWeight(input.value);
  const unit = validUnit(input.unit);
  const candidateType = String(input.candidateType ?? "");
  if (candidateType !== "weight") throw invalid("The candidate type must be Weight.");
  const parserVersion = String(input.localParserVersion ?? "").trim();
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(parserVersion)) throw invalid("The local parser version is invalid.");
  const confidence = Number(input.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw invalid("The Weight confidence is invalid.");
  const assetSha256 = String(input.assetSha256 ?? "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(assetSha256)) throw invalid("The asset checksum is invalid.");
  const provenance = input.fieldProvenance?.value;
  if (!provenance || provenance.source !== "native_local_extraction" || !Array.isArray(provenance.regions)) {
    throw invalid("Per-field Weight provenance is required.");
  }
  const disposition = confidence >= 0.9 ? "deterministic_review_ready" : "interpretation_escalation_required";
  return Object.freeze({
    schemaVersion: NATIVE_WEIGHT_CANDIDATE_SCHEMA_VERSION,
    submissionIdentity,
    idempotencyKey,
    measurementDate,
    candidateType,
    value,
    unit,
    confidence,
    localParserVersion: parserVersion,
    assetSha256,
    founderContext: cleanOptionalText(input.founderContext, 2_000),
    fieldProvenance: structuredClone(input.fieldProvenance),
    disposition,
  });
}

function validateAsset(asset, expectedSha256) {
  const bytes = Buffer.isBuffer(asset?.bytes) ? asset.bytes : Buffer.from(asset?.bytes ?? []);
  const contentType = String(asset?.contentType ?? "").toLowerCase();
  const filename = String(asset?.filename ?? "weight-evidence").slice(0, 180);
  if (!bytes.length || bytes.length > 50 * 1024 * 1024) throw invalid("The Weight evidence asset is invalid.");
  if (!/^(image\/(?:jpeg|png|heic|heif)|application\/pdf)$/.test(contentType)) {
    throw invalid("The Weight evidence file type is unavailable.");
  }
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== expectedSha256) throw invalid("The Weight evidence checksum does not match the submitted asset.");
  return Object.freeze({ bytes, contentType, filename });
}

function createPendingWeightReview({ authority, ownerUserId, intakeId, candidate, stored, at }) {
  const reviewId = `native_sandbox_weight_review_${candidate.submissionIdentity.replaceAll("-", "")}`;
  const objectId = `native_sandbox_weight_${candidate.submissionIdentity.replaceAll("-", "")}`;
  return Object.freeze({
    schemaVersion: "1",
    id: reviewId,
    userId: ownerUserId,
    sandboxAuthority: authority,
    status: candidate.disposition === "deterministic_review_ready" ? "pending" : "interpretation_required",
    version: 1,
    intakeId,
    submissionIdentity: candidate.submissionIdentity,
    occurrenceDate: candidate.measurementDate,
    candidate,
    interpretedEvidence: Object.freeze({
      package_id: `native_sandbox_package_${candidate.submissionIdentity.replaceAll("-", "")}`,
      observed_date: candidate.measurementDate,
      evidence_objects: Object.freeze([Object.freeze({
        id: objectId,
        evidence_type: "weight",
        observed_at: candidate.measurementDate,
        value: candidate.value,
        unit: candidate.unit,
        confidence: Object.freeze({ extraction: candidate.confidence, interpretation: "not_required" }),
        provenance_ref: stored.reference,
      })]),
      provenance: Object.freeze({
        intake_receipt_id: intakeId,
        source_artifacts: Object.freeze([Object.freeze({
          id: stored.objectId,
          kind: "original_asset",
          reference: stored.reference,
          sha256: stored.sha256,
          contentType: stored.contentType,
        })]),
        local_parser_version: candidate.localParserVersion,
      }),
    }),
    createdAt: at,
    updatedAt: at,
  });
}

function validWeight(value) {
  const result = Number(value);
  if (!Number.isFinite(result) || result < 50 || result > 1_000) throw invalid("Enter a valid Weight value.");
  return Math.round(result * 10) / 10;
}
function validUnit(value) {
  const unit = String(value ?? "").toLowerCase();
  if (!["lb", "kg"].includes(unit)) throw invalid("Weight unit must be lb or kg.");
  return unit;
}
function calendarDate(value) {
  const candidate = String(value ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) throw invalid("The measurement date is invalid.");
  const [year, month, day] = candidate.split("-").map(Number);
  if (new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) !== candidate) throw invalid("The measurement date is invalid.");
  return candidate;
}
function cleanOptionalText(value, max) {
  const text = String(value ?? "").trim();
  if (text.length > max) throw invalid("The submitted context is too long.");
  return text || null;
}
function uuid(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function invalid(title) { return new ApplicationProblem({ status: 400, code: "NATIVE_SANDBOX_WEIGHT_CANDIDATE_INVALID", title }); }
function conflict(title) { return new ApplicationProblem({ status: 409, code: "NATIVE_SANDBOX_WEIGHT_REVIEW_CONFLICT", title }); }
function unavailable() { return new ApplicationProblem({ status: 404, code: "RESOURCE_NOT_FOUND", title: "The requested resource is unavailable." }); }
function elapsed(clock, startedAt) { return Math.max(0, Math.round((clock() - startedAt) * 100) / 100); }
function observe(logger, event, details) { logger?.info(event, details); }
