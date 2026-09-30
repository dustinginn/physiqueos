import { ApplicationProblem, staleVersionProblem } from "../../contracts/v1/problem.js";
import {
  applyPreparedPeptideExecutionTransition,
  classifyPeptideExecutionState,
  PeptideExecutionOutcome,
  PeptideLifecycleOperation,
  preparePeptideLifecycleTransition,
  verifyPreparedPeptideExecutionTransition,
} from "../../domain/services/PeptideExecutionManagementService.js";
import { getLocalDateKey, resolveLocalTimeZone, shiftLocalDateKey } from "../../domain/utils/localDate.js";

/// `operating-plan.peptide-lifecycle.change.v1` — Pause/Resume as a dated
/// suspension window on the peptide execution item (design S3). The port owns
/// only transport concerns: the user's canonical local date, If-Match against
/// `executionRevision`, and problem mapping. The transition itself is the pure
/// domain rule Web and Native share; persistence goes through the same
/// candidate-collection helpers every other canonical port uses.
export const PEPTIDE_LIFECYCLE_BOUNDED_COLLECTIONS = Object.freeze(["executionItems"]);
export const PEPTIDE_LIFECYCLE_READ_COLLECTIONS = Object.freeze(["user", "protocols", "reminders", ...PEPTIDE_LIFECYCLE_BOUNDED_COLLECTIONS]);
const EFFECTIVE_DATES = Object.freeze(["today", "tomorrow"]);

export function createPeptideLifecyclePort({ now = () => new Date(), loadCandidate, persistCandidateCollections } = {}) {
  if (typeof loadCandidate !== "function" || typeof persistCandidateCollections !== "function") {
    throw new Error("The peptide lifecycle port requires the canonical candidate helpers.");
  }
  return async function changePeptideLifecycle(context) {
    const operation = context.payload.operation;
    if (!Object.values(PeptideLifecycleOperation).includes(operation)) {
      throw problem(400, "PEPTIDE_LIFECYCLE_INVALID", "Choose Pause or Resume.");
    }
    const requestedDate = context.payload.effectiveDate ?? "today";
    if (!EFFECTIVE_DATES.includes(requestedDate)) {
      throw problem(400, "PEPTIDE_LIFECYCLE_INVALID", "Choose whether the pause starts today or tomorrow.");
    }
    if (operation === PeptideLifecycleOperation.RESUME && requestedDate !== "today") {
      throw problem(400, "PEPTIDE_LIFECYCLE_INVALID", "Resume takes effect today.");
    }
    const { candidate, before } = await loadCandidate(PEPTIDE_LIFECYCLE_READ_COLLECTIONS, context.ownerUserId);
    const protocolId = context.payload.protocolId;
    const protocol = (candidate.protocols ?? []).find((item) =>
      item.id === protocolId && item.userId === context.ownerUserId && item.category === "peptide"
    ) ?? null;
    const reminders = (candidate.reminders ?? []).filter((item) =>
      item.userId === context.ownerUserId && item.type === "protocol_reminder" && item.linkedEntityId === protocolId
    );
    const reminder = reminders.length === 1 ? reminders[0] : null;
    const today = getLocalDateKey(now(), resolveLocalTimeZone(candidate.user?.timeZone ?? candidate.user?.timezone));
    const effectiveDate = requestedDate === "tomorrow" ? shiftLocalDateKey(today, 1) : today;
    const prepared = preparePeptideLifecycleTransition({
      protocol,
      executionItems: candidate.executionItems ?? [],
      reminder,
      operation,
      effectiveDate,
      now: now(),
      reason: context.payload.reason ?? null,
      expectedRevision: context.metadata.expectedVersion,
    });
    if (!prepared.ok) {
      if (prepared.outcome === PeptideExecutionOutcome.NOT_FOUND) {
        throw problem(404, "PEPTIDE_LIFECYCLE_UNAVAILABLE", prepared.reason);
      }
      if (prepared.outcome === PeptideExecutionOutcome.VERSION_CONFLICT) {
        const current = protocol
          ? classifyPeptideExecutionState({ protocol, executionItems: candidate.executionItems ?? [] }).record
          : null;
        throw staleVersionProblem({
          expectedVersion: context.metadata.expectedVersion,
          actualVersion: current?.executionRevision ?? (current ? 1 : null),
          resource: `peptide-execution:${protocolId}`,
        });
      }
      if ([PeptideExecutionOutcome.NOT_ACTIVE, PeptideExecutionOutcome.NOT_PAUSED].includes(prepared.outcome)) {
        throw problem(409, prepared.code, prepared.reason);
      }
      throw problem(400, "PEPTIDE_LIFECYCLE_INVALID", prepared.reason ?? "This peptide cannot be paused or resumed right now.");
    }
    const applied = applyPreparedPeptideExecutionTransition(candidate, prepared);
    if (!verifyPreparedPeptideExecutionTransition(candidate, prepared)) {
      throw problem(500, "PEPTIDE_LIFECYCLE_PERSISTENCE_FAILED", "We could not confirm this peptide change. Nothing was changed.");
    }
    await persistCandidateCollections({
      before,
      candidate,
      collections: PEPTIDE_LIFECYCLE_BOUNDED_COLLECTIONS,
      ownerUserId: context.ownerUserId,
    });
    return {
      status: "committed",
      result: {
        status: operation === PeptideLifecycleOperation.PAUSE ? "paused" : "resumed",
        operation,
        protocolId,
        executionId: applied.executionId,
        executionRevision: applied.executionRevision,
        priorityId: reminder?.id ?? null,
        lifecycle: prepared.lifecycle,
      },
      outbox: [],
    };
  };
}

function problem(status, code, title, fieldErrors = []) {
  return new ApplicationProblem({ status, code, title, fieldErrors });
}
