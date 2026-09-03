import { ApplicationProblem } from "../../contracts/v1/problem.js";
import {
  calendarWeightDate,
  validUnit,
  validWeight,
} from "../../platform/sandbox/nativeSandboxWeightValidation.js";
import { NATIVE_SANDBOX_WEIGHT_CONTINUATION_TOPIC } from "../../platform/sandbox/NativeSandboxAuthority.js";

export const NATIVE_SANDBOX_MANUAL_WEIGHT_SCHEMA_VERSION = "1";

// Mirrors production manual Weight (src/domain/services/
// MorningCheckInPersistenceService.js): a scalar value/date/unit is
// validated and written straight to canonical Weight, with no Evidence
// Review stage. No asset, no OCR provenance, no OpenAI/PI involvement -
// this command never touches media or the OpenAI client.
export function createNativeSandboxManualWeightService({
  authority,
  store,
  clock = () => new Date(),
  performanceClock = () => performance.now(),
  logger = null,
} = {}) {
  if (!authority?.requirePrincipal || !authority?.envelopeOutbox || !store?.writeManual) {
    throw new Error("Native sandbox manual Weight intake dependencies are required.");
  }

  return Object.freeze({
    async submit({ principal, submission, requestId = null }) {
      const actor = authority.requirePrincipal(principal, "founder:write");
      const validationStartedAt = performanceClock();
      const candidate = validateSubmission(submission);
      observe(logger, "native.sandbox.weight_manual.validated", {
        requestId,
        authorityId: authority.descriptor.authorityId,
        durationMs: elapsed(performanceClock, validationStartedAt),
      });

      const at = clock().toISOString();
      const weightEntry = Object.freeze({
        id: `native_sandbox_weight_manual_${candidate.measurementDate.replaceAll("-", "_")}`,
        userId: actor.userId,
        measuredAt: candidate.measurementDate,
        weight: Object.freeze({ value: candidate.value, unit: candidate.unit }),
        source: Object.freeze({ type: "manual", name: "Native sandbox acceptance", confidence: "high" }),
        createdAt: at,
        updatedAt: at,
      });
      const continuation = authority.envelopeOutbox({
        topic: NATIVE_SANDBOX_WEIGHT_CONTINUATION_TOPIC,
        dedupeKey: `weight-manual:${candidate.idempotencyKey}`,
        payload: { weightEntryId: weightEntry.id, measurementDate: candidate.measurementDate },
      });

      const persistenceStartedAt = performanceClock();
      const result = await store.writeManual({
        authority: authority.descriptor,
        ownerUserId: actor.userId,
        submissionIdentity: candidate.submissionIdentity,
        idempotencyKey: candidate.idempotencyKey,
        weightEntry,
        continuation,
        confirmedAt: at,
      });
      observe(logger, "native.sandbox.weight_manual.canonical_commit_and_outbox_enqueued", {
        requestId,
        authorityId: authority.descriptor.authorityId,
        changed: result.changed,
        durationMs: elapsed(performanceClock, persistenceStartedAt),
      });

      return Object.freeze({
        schemaVersion: NATIVE_SANDBOX_MANUAL_WEIGHT_SCHEMA_VERSION,
        id: result.weightEntry.id,
        status: "confirmed",
        measurementDate: result.weightEntry.measuredAt,
        value: result.weightEntry.weight.value,
        unit: result.weightEntry.weight.unit,
      });
    },
  });
}

function validateSubmission(input = {}) {
  const submissionIdentity = String(input.submissionIdentity ?? "").trim();
  const idempotencyKey = String(input.idempotencyKey ?? "").trim();
  if (!uuid(submissionIdentity) || !/^[A-Za-z0-9._:-]{8,120}$/.test(idempotencyKey)) {
    throw invalid("The Weight submission identity is invalid.");
  }
  const measurementDate = wrap(() => calendarWeightDate(input.measurementDate), "The measurement date is invalid.");
  const value = wrap(() => validWeight(input.value), "Enter a valid Weight value.");
  const unit = wrap(() => validUnit(input.unit), "Weight unit must be lb or kg.");
  return Object.freeze({ submissionIdentity, idempotencyKey, measurementDate, value, unit });
}

function wrap(fn, message) {
  try { return fn(); } catch { throw invalid(message); }
}
function uuid(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function invalid(title) { return new ApplicationProblem({ status: 400, code: "NATIVE_SANDBOX_WEIGHT_MANUAL_INVALID", title }); }
function elapsed(clock, startedAt) { return Math.max(0, Math.round((clock() - startedAt) * 100) / 100); }
function observe(logger, event, details) { logger?.info(event, details); }
