import { createCommandMetadata } from "../../contracts/v1/command.js";
import { ApplicationProblem } from "../../contracts/v1/problem.js";
import { executeIdempotentCommand } from "./executeIdempotentCommand.js";
import { requireAuthenticationPrincipal } from "../auth/principal.js";

export const Phase3Command = Object.freeze({
  SUBMIT_WEIGHT: "weight.submit.v1",
  SUBMIT_CHECK_IN: "check-in.submit.v1",
  CREATE_EVIDENCE_INTAKE: "evidence-intake.create.v1",
  EDIT_EVIDENCE_REVIEW: "evidence-review.edit.v1",
  CONFIRM_EVIDENCE_REVIEW: "evidence-review.confirm.v1",
  DISPOSE_EVIDENCE_REVIEW: "evidence-review.dispose.v1",
  COMPLETE_PRIORITY: "priority.complete.v1",
  RECONCILE_PREVIOUS_DAY: "previous-day.reconcile.v1",
  EDIT_PROTOCOL: "protocol.edit.v1",
  EDIT_GOAL: "goal.edit.v1",
  TRANSITION_GOAL: "goal.transition.v1",
  CREATE_TRAINING_SESSION: "training-session.create.v1",
  CORRECT_TRAINING_SESSION: "training-session.correct.v1",
  COMPLETE_TRAINING_LOGGER: "training-logger.complete.v1",
  CONFIRM_NUTRITION: "nutrition-evidence.confirm.v1",
  CONFIRM_PHOTO: "photo-evidence.confirm.v1",
  CONFIRM_DEXA: "dexa-evidence.confirm.v1",
});

const DEFINITIONS = Object.freeze({
  [Phase3Command.SUBMIT_WEIGHT]: define("submitWeight", ["localDate", "value"], false),
  [Phase3Command.SUBMIT_CHECK_IN]: define("submitCheckIn", ["localDate"], false),
  [Phase3Command.CREATE_EVIDENCE_INTAKE]: define("createEvidenceIntake", ["submissionId"], false),
  [Phase3Command.EDIT_EVIDENCE_REVIEW]: define("editEvidenceReview", ["reviewId"], true),
  [Phase3Command.CONFIRM_EVIDENCE_REVIEW]: define("confirmEvidenceReview", ["reviewId"], true),
  [Phase3Command.DISPOSE_EVIDENCE_REVIEW]: define("disposeEvidenceReview", ["reviewId", "disposition"], true),
  [Phase3Command.COMPLETE_PRIORITY]: define("completePriority", ["priorityId", "occurrenceDate"], true),
  [Phase3Command.RECONCILE_PREVIOUS_DAY]: define("reconcilePreviousDay", ["localDate", "items"], true),
  [Phase3Command.EDIT_PROTOCOL]: define("editProtocol", ["protocolId"], true),
  [Phase3Command.EDIT_GOAL]: define("editGoal", ["goalId"], true),
  [Phase3Command.TRANSITION_GOAL]: define("transitionGoal", ["goalId", "transitionId"], true),
  [Phase3Command.CREATE_TRAINING_SESSION]: define("createTrainingSession", ["sessionId", "observedAt"], false),
  [Phase3Command.CORRECT_TRAINING_SESSION]: define("correctTrainingSession", ["sessionId"], true),
  [Phase3Command.COMPLETE_TRAINING_LOGGER]: define("completeTrainingLogger", ["draftId", "localDate"], true),
  [Phase3Command.CONFIRM_NUTRITION]: define("confirmNutritionEvidence", ["reviewId"], true),
  [Phase3Command.CONFIRM_PHOTO]: define("confirmPhotoEvidence", ["reviewId"], true),
  [Phase3Command.CONFIRM_DEXA]: define("confirmDexaEvidence", ["reviewId"], true),
});

export function createPhase3CommandService({ transactionRunner, ports, writeFence = null } = {}) {
  if (!transactionRunner?.run) throw new Error("Phase 3 commands require a transaction runner.");
  return Object.freeze({
    async execute({ commandType, principal, metadata: metadataInput, payload = {} } = {}) {
      const actor = requireAuthenticationPrincipal(principal);
      const definition = DEFINITIONS[commandType];
      if (!definition) throw validation("commandType", "The command type is unsupported.");
      if (payload.userId != null) throw validation("userId", "Resource ownership comes from the authenticated principal.");
      for (const field of definition.required) {
        const value = payload[field];
        if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) throw validation(field, `${field} is required.`);
      }
      validatePayload(commandType, payload);
      const metadata = createCommandMetadata(metadataInput);
      if (definition.expectedVersion && metadata.expectedVersion == null) {
        throw validation("expectedVersion", "An expected version is required for this command.");
      }
      const port = ports?.[definition.port];
      if (typeof port !== "function") throw new Error(`Canonical command port ${definition.port} is not composed.`);
      const fenceState = await writeFence?.assertWriteAllowed({
        operation: `phase3-command:${commandType}`,
        expectedEpoch: metadata.canonicalStoreEpoch,
      }) ?? null;
      return executeIdempotentCommand({
        transactionRunner,
        principal: actor,
        metadata,
        commandType,
        payload: structuredClone(payload),
        canonicalStoreEpoch: fenceState?.canonicalStoreEpoch ?? metadata.canonicalStoreEpoch,
        handler: async (context) => {
          const outcome = await port(Object.freeze({ ...context, ownerUserId: actor.userId }));
          return Object.freeze({
            status: outcome?.status ?? "committed",
            result: outcome?.result ?? outcome ?? null,
            operationId: outcome?.operationId ?? null,
            outbox: outcome?.outbox ?? [],
          });
        },
      });
    },
  });
}

export function listPhase3CommandContracts() {
  return Object.freeze(Object.entries(DEFINITIONS).map(([commandType, definition]) => Object.freeze({
    commandType,
    payloadVersion: "1",
    requiredPayloadFields: definition.required,
    expectedVersionRequired: definition.expectedVersion,
  })));
}

function define(port, required, expectedVersion) { return Object.freeze({ port, required: Object.freeze(required), expectedVersion }); }
function validation(field, detail) { return new ApplicationProblem({ status: 400, code: "CONTRACT_VALIDATION_FAILED", title: "The command contract is invalid.", fieldErrors: [{ field, code: "required", detail }] }); }
function validatePayload(commandType, payload) {
  for (const field of ["localDate", "occurrenceDate"]) {
    if (payload[field] != null && !isCalendarDate(payload[field])) throw validation(field, `${field} must be a valid YYYY-MM-DD calendar date.`);
  }
  if (commandType === Phase3Command.SUBMIT_WEIGHT && (!Number.isFinite(Number(payload.value)) || Number(payload.value) <= 0)) {
    throw validation("value", "Weight must be a positive number.");
  }
  if (payload.items != null && !Array.isArray(payload.items)) throw validation("items", "items must be an array.");
  if (payload.observedAt != null && Number.isNaN(Date.parse(payload.observedAt))) throw validation("observedAt", "observedAt must be an ISO date-time.");
  for (const field of ["submissionId", "reviewId", "priorityId", "protocolId", "goalId", "transitionId", "sessionId", "draftId"]) {
    if (payload[field] != null && !String(payload[field]).trim()) throw validation(field, `${field} must be a non-empty identity.`);
  }
}
function isCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === value;
}
