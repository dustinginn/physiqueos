import {
  WorkerMutationClassification,
  WorkerReadbackClassification,
  workerControlError,
  WorkerErrorCode,
} from "./combinedCutoverWorkerControl.js";

/** One Windows mutation per exact resource until bounded readback resolves its outcome. */
export function createWorkerMutationReconciler({ maximumReadbackAttempts = 3, readbackIntervalMs = 100, wait = delay } = {}) {
  boundedInteger(maximumReadbackAttempts, "maximumReadbackAttempts", 1, 20);
  boundedInteger(readbackIntervalMs, "readbackIntervalMs", 0, 60_000);
  const unresolved = new Map();

  async function execute({ resourceKey, operationIdentity, mutate, readCurrent, classifyReadback } = {}) {
    const key = required(resourceKey, "resourceKey");
    const identity = normalizeIdentity(operationIdentity);
    for (const [name, value] of Object.entries({ mutate, readCurrent, classifyReadback })) {
      if (typeof value !== "function") throw new Error(`${name} must be a function.`);
    }
    if (unresolved.has(key)) {
      throw workerControlError(WorkerErrorCode.AMBIGUOUS, "A prior mutation against this worker resource remains unresolved; a second mutation is forbidden.", {
        mutationAttempted: true,
        mutationClassification: WorkerMutationClassification.UNRESOLVED,
        operationIdentity: identity,
        resourceKey: key,
      });
    }
    unresolved.set(key, identity);

    let mutationClassification = WorkerMutationClassification.ACCEPTED;
    try {
      const result = await mutate();
      if (result?.classification && result.classification !== WorkerMutationClassification.ACCEPTED) {
        throw workerControlError(WorkerErrorCode.RETIRE_FAILED, "Worker transport rejected the mutation.", {
          mutationClassification: result.classification,
        });
      }
    } catch (error) {
      if (error?.classification !== WorkerMutationClassification.AMBIGUOUS) {
        unresolved.delete(key);
        throw error;
      }
      mutationClassification = WorkerMutationClassification.AMBIGUOUS;
    }

    const { classification, attempts } = await boundedReadback({ readCurrent, classifyReadback });
    if (classification !== WorkerReadbackClassification.STILL_AMBIGUOUS) unresolved.delete(key);
    return freeze({
      mutationClassification,
      readbackClassification: classification,
      readAttempts: attempts,
      operationIdentity: identity,
      resourceKey: key,
    });
  }

  async function boundedReadback({ readCurrent, classifyReadback }) {
    let attempts = 0;
    let classification = WorkerReadbackClassification.STILL_AMBIGUOUS;
    while (attempts < maximumReadbackAttempts) {
      attempts += 1;
      try { classification = classifyReadback(await readCurrent()); } catch { classification = WorkerReadbackClassification.STILL_AMBIGUOUS; }
      if (classification !== WorkerReadbackClassification.STILL_AMBIGUOUS) break;
      if (attempts < maximumReadbackAttempts && readbackIntervalMs) await wait(readbackIntervalMs);
    }
    return { classification, attempts };
  }

  return freeze({ execute, hasUnresolvedMutation: (resourceKey) => unresolved.has(String(resourceKey)) });
}

function normalizeIdentity(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("operationIdentity must be an object.");
  return freeze({
    operationId: required(value.operationId, "operationIdentity.operationId"),
    commandId: required(value.commandId, "operationIdentity.commandId"),
  });
}

function required(value, field) {
  const candidate = String(value ?? "").trim();
  if (!candidate) throw new Error(`${field} is required.`);
  return candidate;
}

function boundedInteger(value, field, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`${field} must be an integer from ${minimum} through ${maximum}.`);
}

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function freeze(value) { return Object.freeze(value); }
