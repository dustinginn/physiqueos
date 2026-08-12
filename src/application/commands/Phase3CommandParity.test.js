import { describe, expect, it, vi } from "vitest";
import { createAuthenticationPrincipal } from "../auth/principal.js";
import { createInMemoryFoundationTransactionStore } from "../../platform/commands/InMemoryFoundationTransactionStore.js";
import { createPhase3CommandService, listPhase3CommandContracts, Phase3Command } from "./Phase3CommandService.js";

const principal = createAuthenticationPrincipal({ userId: "owner-one", deviceId: "device-one", sessionId: "session-one" });
const payloads = {
  [Phase3Command.SUBMIT_WEIGHT]: { localDate: "2026-08-11", value: 180 },
  [Phase3Command.SUBMIT_CHECK_IN]: { localDate: "2026-08-11", energy: 4 },
  [Phase3Command.CREATE_EVIDENCE_INTAKE]: { submissionId: "submission-one", artifacts: ["object-one"] },
  [Phase3Command.EDIT_EVIDENCE_REVIEW]: { reviewId: "review-one", corrections: [] },
  [Phase3Command.CONFIRM_EVIDENCE_REVIEW]: { reviewId: "review-one" },
  [Phase3Command.DISPOSE_EVIDENCE_REVIEW]: { reviewId: "review-one", disposition: "rejected" },
  [Phase3Command.COMPLETE_PRIORITY]: { priorityId: "priority-one", occurrenceDate: "2026-08-11" },
  [Phase3Command.RECONCILE_PREVIOUS_DAY]: { localDate: "2026-08-10", items: [{ id: "item-one", complete: true }] },
  [Phase3Command.EDIT_PROTOCOL]: { protocolId: "protocol-one", patch: { active: true } },
  [Phase3Command.EDIT_GOAL]: { goalId: "goal-one", patch: { title: "Goal" } },
  [Phase3Command.TRANSITION_GOAL]: { goalId: "goal-one", transitionId: "transition-one" },
  [Phase3Command.CREATE_TRAINING_SESSION]: { sessionId: "session-one", observedAt: "2026-08-11T17:00:00Z" },
  [Phase3Command.CORRECT_TRAINING_SESSION]: { sessionId: "session-one", corrections: [] },
  [Phase3Command.COMPLETE_TRAINING_LOGGER]: { draftId: "draft-one", localDate: "2026-08-11" },
  [Phase3Command.CONFIRM_NUTRITION]: { reviewId: "review-nutrition" },
  [Phase3Command.CONFIRM_PHOTO]: { reviewId: "review-photo" },
  [Phase3Command.CONFIRM_DEXA]: { reviewId: "review-dexa" },
};

describe("Phase 3 task command parity boundary", () => {
  it("dispatches every approved task to one canonical owner-scoped port", async () => {
    const ports = Object.fromEntries(listPhase3CommandContracts().map((contract) => {
      const portName = commandPort(contract.commandType);
      return [portName, vi.fn(async ({ ownerUserId, payload }) => ({ result: { ownerUserId, canonicalPayload: payload, revision: "2" } }))];
    }));
    const service = createPhase3CommandService({ transactionRunner: createInMemoryFoundationTransactionStore(), ports });
    let index = 0;
    for (const contract of listPhase3CommandContracts()) {
      index += 1;
      const result = await service.execute({
        commandType: contract.commandType,
        principal,
        metadata: { idempotencyKey: `phase3-parity-command-${String(index).padStart(2, "0")}`, expectedVersion: contract.expectedVersionRequired ? "1" : null },
        payload: payloads[contract.commandType],
      });
      expect(result.outcome).toBe("committed");
      expect(result.receipt.result).toMatchObject({ ownerUserId: "owner-one", canonicalPayload: payloads[contract.commandType], revision: "2" });
      expect(ports[commandPort(contract.commandType)]).toHaveBeenCalledOnce();
    }
  });

  it("preserves idempotent replay and rejects payload drift", async () => {
    const submitWeight = vi.fn(async ({ payload }) => ({ result: { value: payload.value, revision: "2" } }));
    const service = createPhase3CommandService({ transactionRunner: createInMemoryFoundationTransactionStore(), ports: { submitWeight } });
    const input = { commandType: Phase3Command.SUBMIT_WEIGHT, principal, metadata: { idempotencyKey: "phase3-weight-command-0001" }, payload: payloads[Phase3Command.SUBMIT_WEIGHT] };
    expect((await service.execute(input)).outcome).toBe("committed");
    expect((await service.execute(input)).outcome).toBe("replayed");
    await expect(service.execute({ ...input, payload: { ...input.payload, value: 181 } })).rejects.toMatchObject({ status: 409, code: "IDEMPOTENCY_KEY_REUSED" });
    expect(submitWeight).toHaveBeenCalledOnce();
  });

  it("fails closed for missing identity, spoofed ownership, invalid payload, and missing edit versions", async () => {
    const service = createPhase3CommandService({ transactionRunner: createInMemoryFoundationTransactionStore(), ports: { submitWeight: vi.fn(), editGoal: vi.fn() } });
    await expect(service.execute({ commandType: Phase3Command.SUBMIT_WEIGHT, payload: payloads[Phase3Command.SUBMIT_WEIGHT] })).rejects.toMatchObject({ status: 401 });
    await expect(service.execute({ commandType: Phase3Command.SUBMIT_WEIGHT, principal, metadata: { idempotencyKey: "phase3-owner-spoof-0001" }, payload: { ...payloads[Phase3Command.SUBMIT_WEIGHT], userId: "other" } })).rejects.toMatchObject({ status: 400 });
    await expect(service.execute({ commandType: Phase3Command.SUBMIT_WEIGHT, principal, metadata: { idempotencyKey: "phase3-missing-value-001" }, payload: { localDate: "2026-08-11" } })).rejects.toMatchObject({ status: 400 });
    await expect(service.execute({ commandType: Phase3Command.EDIT_GOAL, principal, metadata: { idempotencyKey: "phase3-missing-version-01" }, payload: payloads[Phase3Command.EDIT_GOAL] })).rejects.toMatchObject({ status: 400 });
  });

  it("matches direct canonical mutation state and downstream effects for representative daily writes", async () => {
    const representatives = [
      Phase3Command.SUBMIT_WEIGHT, Phase3Command.SUBMIT_CHECK_IN, Phase3Command.COMPLETE_PRIORITY,
      Phase3Command.EDIT_PROTOCOL, Phase3Command.CONFIRM_EVIDENCE_REVIEW, Phase3Command.CORRECT_TRAINING_SESSION,
      Phase3Command.COMPLETE_TRAINING_LOGGER, Phase3Command.EDIT_GOAL, Phase3Command.CONFIRM_PHOTO, Phase3Command.CONFIRM_DEXA,
    ];
    let index = 0;
    for (const commandType of representatives) {
      index += 1;
      const directState = fixtureState();
      const boundaryState = fixtureState();
      const direct = applyCanonicalFixtureMutation(directState, commandType, payloads[commandType], "owner-one");
      const portName = commandPort(commandType);
      const service = createPhase3CommandService({
        transactionRunner: createInMemoryFoundationTransactionStore(),
        ports: { [portName]: async ({ payload, ownerUserId }) => ({ result: applyCanonicalFixtureMutation(boundaryState, commandType, payload, ownerUserId) }) },
      });
      const expectedVersionRequired = listPhase3CommandContracts().find((item) => item.commandType === commandType).expectedVersionRequired;
      const result = await service.execute({ commandType, principal, metadata: { idempotencyKey: `phase3-mutation-parity-${String(index).padStart(2, "0")}`, correlationId: `correlation-${String(index).padStart(2, "0")}`, expectedVersion: expectedVersionRequired ? "1" : null }, payload: payloads[commandType] });
      expect(boundaryState).toEqual(directState);
      expect(result.receipt.result).toEqual(direct);
      expect(boundaryState).toMatchObject({ revision: 2, provenance: [{ actorUserId: "owner-one", commandType }], downstreamEffects: [{ type: "read-model.invalidate", commandType }], suppressedDuplicates: 0 });
    }
  });
});

function commandPort(commandType) {
  return ({
    [Phase3Command.SUBMIT_WEIGHT]: "submitWeight", [Phase3Command.SUBMIT_CHECK_IN]: "submitCheckIn", [Phase3Command.CREATE_EVIDENCE_INTAKE]: "createEvidenceIntake",
    [Phase3Command.EDIT_EVIDENCE_REVIEW]: "editEvidenceReview", [Phase3Command.CONFIRM_EVIDENCE_REVIEW]: "confirmEvidenceReview", [Phase3Command.DISPOSE_EVIDENCE_REVIEW]: "disposeEvidenceReview",
    [Phase3Command.COMPLETE_PRIORITY]: "completePriority", [Phase3Command.RECONCILE_PREVIOUS_DAY]: "reconcilePreviousDay", [Phase3Command.EDIT_PROTOCOL]: "editProtocol",
    [Phase3Command.EDIT_GOAL]: "editGoal", [Phase3Command.TRANSITION_GOAL]: "transitionGoal", [Phase3Command.CREATE_TRAINING_SESSION]: "createTrainingSession",
    [Phase3Command.CORRECT_TRAINING_SESSION]: "correctTrainingSession", [Phase3Command.COMPLETE_TRAINING_LOGGER]: "completeTrainingLogger", [Phase3Command.CONFIRM_NUTRITION]: "confirmNutritionEvidence",
    [Phase3Command.CONFIRM_PHOTO]: "confirmPhotoEvidence", [Phase3Command.CONFIRM_DEXA]: "confirmDexaEvidence",
  })[commandType];
}

function fixtureState() { return { revision: 1, records: [], provenance: [], downstreamEffects: [], suppressedDuplicates: 0 }; }
function applyCanonicalFixtureMutation(state, commandType, payload, actorUserId) {
  state.revision += 1;
  state.records.push({ commandType, payload: structuredClone(payload), ownerUserId: actorUserId, version: String(state.revision) });
  state.provenance.push({ actorUserId, commandType });
  state.downstreamEffects.push({ type: "read-model.invalidate", commandType });
  return { canonicalMutation: structuredClone(state.records.at(-1)), revision: String(state.revision), sideEffectCount: state.downstreamEffects.length };
}
