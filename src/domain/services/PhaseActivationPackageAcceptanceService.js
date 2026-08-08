import {
  PhaseActivationRecordStatus,
  activationRecordFingerprint,
  deepFreeze,
  immutablePhaseRecordContent,
} from "../models/phaseActivationRecord";
import { createPhaseStrategy, validatePhaseStrategy } from "../models/phaseStrategy";
import {
  createPhaseExpectedTrajectory,
  validatePhaseExpectedTrajectory,
} from "../models/phaseExpectedTrajectory";

export function createPhaseActivationPackageAcceptanceService({
  now = () => new Date(),
  createAcceptanceId = ({ record, idempotencyKey }) =>
    `phase_activation_acceptance|${record.id}|${idempotencyKey}`,
} = {}) {
  const receipts = new Map();
  return Object.freeze({
    submitStrategyForReview: (record, command) => submit(record, command, createPhaseStrategy),
    submitTrajectoryForReview: (record, command) => submit(record, command, createPhaseExpectedTrajectory),
    acceptStrategy: (record, command) => accept(record, command, {
      validate: validatePhaseStrategy, create: createPhaseStrategy,
    }),
    acceptTrajectory: (record, command) => accept(record, command, {
      validate: validatePhaseExpectedTrajectory, create: createPhaseExpectedTrajectory,
    }),
    rejectStrategy: (record, command) => close(record, command, createPhaseStrategy, "rejected"),
    rejectTrajectory: (record, command) => close(record, command, createPhaseExpectedTrajectory, "rejected"),
    supersedeStrategy: (record, command) => close(record, command, createPhaseStrategy, "superseded"),
    supersedeTrajectory: (record, command) => close(record, command, createPhaseExpectedTrajectory, "superseded"),
    assertAcceptedStrategyUnchanged: (record) => assertUnchanged(record, validatePhaseStrategy),
    assertAcceptedTrajectoryUnchanged: (record) => assertUnchanged(record, validatePhaseExpectedTrajectory),
  });

  function accept(record, command = {}, contract) {
    contract.validate(record);
    const authorization = command.authorization;
    if (authorization?.authorized !== true || authorization.scope !== "phase_activation_package_acceptance" ||
        authorization.recordId !== record.id || authorization.actorId !== command.actorId) {
      throw acceptanceError("PHASE_ACTIVATION_ACCEPTANCE_AUTHORIZATION_REQUIRED",
        "Explicit actor-bound authorization is required.");
    }
    const key = required(command.idempotencyKey, "idempotencyKey");
    const receiptKey = `${record.id}|${key}`;
    if (record.status === PhaseActivationRecordStatus.ACCEPTED) {
      checkRevision(record, command.expectedRevision);
      const expectedId = createAcceptanceId({ record, idempotencyKey: key });
      if (record.acceptedBy !== command.actorId || record.acceptanceId !== expectedId ||
          record.acceptanceIdempotencyKey !== key) {
        throw acceptanceError("PHASE_ACTIVATION_IDEMPOTENCY_CONFLICT", "Acceptance replay does not match the accepted record.");
      }
      return deepFreeze({ status: "accepted", idempotent: true, record: deepFreeze(structuredClone(record)),
        idempotencyKey: key });
    }
    if (record.status !== PhaseActivationRecordStatus.READY_FOR_REVIEW) {
      throw acceptanceError("PHASE_ACTIVATION_RECORD_NOT_READY", "Only ready-for-review records can be accepted.");
    }
    checkRevision(record, command.expectedRevision);
    if (receipts.has(receiptKey)) return deepFreeze({ ...receipts.get(receiptKey), idempotent: true });
    const revision = record.revision + 1;
    const accepted = contract.create({ ...structuredClone(record), revision,
      status: PhaseActivationRecordStatus.ACCEPTED,
      acceptedAt: new Date(now()).toISOString(), acceptedBy: required(command.actorId, "actorId"),
      acceptanceId: createAcceptanceId({ record, idempotencyKey: key }),
      acceptanceIdempotencyKey: key,
      acceptedRevision: revision,
    });
    const result = deepFreeze({ status: "accepted", idempotent: false, record: accepted,
      idempotencyKey: key });
    receipts.set(receiptKey, result);
    return result;
  }

  function close(record, command = {}, create, targetStatus) {
    checkRevision(record, command.expectedRevision);
    const authorization = command.authorization;
    if (authorization?.authorized !== true || authorization.scope !== "phase_activation_package_acceptance" ||
        authorization.recordId !== record.id || authorization.actorId !== command.actorId) {
      throw acceptanceError("PHASE_ACTIVATION_ACCEPTANCE_AUTHORIZATION_REQUIRED",
        "Explicit actor-bound authorization is required.");
    }
    if (targetStatus === "rejected" && record.status !== PhaseActivationRecordStatus.READY_FOR_REVIEW) {
      throw acceptanceError("PHASE_ACTIVATION_REJECTION_INVALID", "Only ready-for-review records can be rejected.");
    }
    if (targetStatus === "superseded" && record.status !== PhaseActivationRecordStatus.ACCEPTED) {
      throw acceptanceError("PHASE_ACTIVATION_SUPERSESSION_INVALID", "Only accepted records can be superseded.");
    }
    const revision = record.revision + 1;
    const actorId = required(command.actorId, "actorId");
    return create({ ...structuredClone(record), revision, status: targetStatus,
      ...(targetStatus === "rejected" ? { rejectedAt: new Date(now()).toISOString(),
        rejectedBy: actorId } : { supersededAt: new Date(now()).toISOString(),
        supersededBy: actorId, supersedesId: required(command.supersedesId, "supersedesId") }),
    });
  }
}

function submit(record, command = {}, create) {
  if (record.status !== PhaseActivationRecordStatus.DRAFT) {
    throw acceptanceError("PHASE_ACTIVATION_RECORD_NOT_DRAFT", "Only draft records can be submitted for review.");
  }
  checkRevision(record, command.expectedRevision);
  return create({ ...structuredClone(record), revision: record.revision + 1,
    status: PhaseActivationRecordStatus.READY_FOR_REVIEW });
}
function assertUnchanged(record, validate) {
  validate(record);
  if (record.status !== PhaseActivationRecordStatus.ACCEPTED) {
    throw acceptanceError("PHASE_ACTIVATION_RECORD_NOT_ACCEPTED", "An accepted record is required.");
  }
  if (record.contentFingerprint !== activationRecordFingerprint(immutablePhaseRecordContent(record))) {
    throw acceptanceError("PHASE_ACTIVATION_ACCEPTED_CONTENT_MUTATED", "Accepted content is immutable.");
  }
  return true;
}
function checkRevision(record, expected) {
  if (!Number.isSafeInteger(expected) || record.revision !== expected) {
    throw acceptanceError("PHASE_ACTIVATION_EXPECTED_REVISION_MISMATCH", "The expected record revision changed.");
  }
}
function required(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${field} is required.`);
  return value.trim();
}
function acceptanceError(code, message) { const error = new Error(message); error.code = code; return error; }
