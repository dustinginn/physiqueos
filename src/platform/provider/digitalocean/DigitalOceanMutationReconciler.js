import {
  ProviderPollClassification,
  ProviderReadbackClassification,
  ProviderResultClassification,
  providerFailure,
  redactProviderEvidence,
} from "./DigitalOceanProviderContract.js";

/**
 * Enforces one mutation attempt per controlled resource until readback resolves its outcome. This
 * is an in-process safety guard, not distributed locking; a future coordinator must persist and
 * serialize its own operation lifecycle across processes.
 */
export function createDigitalOceanMutationReconciler({
  maximumReadbackAttempts = 3,
  readbackIntervalMs = 100,
  wait = delay,
} = {}) {
  boundedInteger(maximumReadbackAttempts, "maximumReadbackAttempts", 1, 20);
  boundedInteger(readbackIntervalMs, "readbackIntervalMs", 0, 60_000);
  const unresolved = new Map();

  async function execute({ resourceKey, operationIdentity, mutate, readCurrent, classifyReadback } = {}) {
    const key = required(resourceKey, "resourceKey");
    const identity = normalizeOperationIdentity(operationIdentity);
    assertFunctions({ mutate, readCurrent, classifyReadback });
    assertNoUnresolved(key, identity);
    unresolved.set(key, identity);

    let mutationResult;
    let mutationWasAmbiguous = false;
    try {
      mutationResult = await mutate();
      if (mutationResult?.classification !== ProviderResultClassification.REQUEST_ACCEPTED) {
        throw providerFailure(ProviderResultClassification.READBACK_MISMATCH, "The mutation did not return an accepted provider result.", {
          resourceKey: key, operationIdentity: identity,
        });
      }
    } catch (error) {
      const requiresReadback = error?.classification === ProviderResultClassification.MUTATION_AMBIGUOUS
        || error?.classification === ProviderResultClassification.IDENTITY_MISMATCH;
      if (!requiresReadback) {
        unresolved.delete(key);
        throw error;
      }
      mutationWasAmbiguous = true;
      mutationResult = Object.freeze({ classification: error.classification, evidence: error.evidence ?? null });
    }

    return reconcile({
      key, identity, mutationResult, mutationWasAmbiguous, readCurrent, classifyReadback,
    });
  }

  async function reconcileUnresolved({ resourceKey, operationIdentity, readCurrent, classifyReadback } = {}) {
    const key = required(resourceKey, "resourceKey");
    const identity = normalizeOperationIdentity(operationIdentity);
    assertFunctions({ readCurrent, classifyReadback });
    const pending = unresolved.get(key);
    if (!pending || pending.operationId !== identity.operationId || pending.commandId !== identity.commandId) {
      throw providerFailure(ProviderResultClassification.MUTATION_UNRESOLVED, "No unresolved mutation matches the supplied resource and operation identity.", {
        resourceKey: key, operationIdentity: identity,
      });
    }
    return reconcile({ key, identity, mutationResult: null, mutationWasAmbiguous: true, readCurrent, classifyReadback });
  }

  async function reconcile({ key, identity, mutationResult, mutationWasAmbiguous, readCurrent, classifyReadback }) {
    let readAttempts = 0;
    let lastReadFailure = null;
    while (readAttempts < maximumReadbackAttempts) {
      readAttempts += 1;
      try {
        const readResult = await readCurrent();
        const classification = classifyReadback(readResult?.value, readResult);
        if (classification === ProviderReadbackClassification.PROVEN_APPLIED) {
          unresolved.delete(key);
          return result({
            classification: ProviderResultClassification.REQUEST_ACCEPTED,
            readbackClassification: classification,
            mutationWasAmbiguous,
            mutationEvidence: safeMutationEvidence(mutationResult),
            resourceKey: key,
            operationIdentity: identity,
            readAttempts,
          });
        }
        if (classification === ProviderReadbackClassification.PROVEN_NOT_APPLIED) {
          unresolved.delete(key);
          return result({
            classification: ProviderResultClassification.READBACK_MISMATCH,
            readbackClassification: classification,
            mutationWasAmbiguous,
            mutationEvidence: safeMutationEvidence(mutationResult),
            resourceKey: key,
            operationIdentity: identity,
            readAttempts,
          });
        }
        if (classification !== ProviderReadbackClassification.STILL_AMBIGUOUS) {
          lastReadFailure = ProviderResultClassification.READBACK_MISMATCH;
        }
      } catch (error) {
        lastReadFailure = error?.classification ?? ProviderResultClassification.READ_FAILED;
      }
      if (readAttempts < maximumReadbackAttempts && readbackIntervalMs) await wait(readbackIntervalMs);
    }
    // Deliberately retain `key` in the unresolved map. The only legal next operation is a bounded
    // read-only `reconcileUnresolved`; another mutation against this key is refused.
    return result({
      classification: ProviderResultClassification.MUTATION_UNRESOLVED,
      readbackClassification: ProviderReadbackClassification.STILL_AMBIGUOUS,
      mutationWasAmbiguous,
      mutationEvidence: safeMutationEvidence(mutationResult),
      resourceKey: key,
      operationIdentity: identity,
      readAttempts,
      lastReadFailure,
    });
  }

  function assertNoUnresolved(key, identity) {
    if (!unresolved.has(key)) return;
    throw providerFailure(ProviderResultClassification.MUTATION_UNRESOLVED, "A prior mutation against this resource remains unresolved; a second mutation is forbidden.", {
      resourceKey: key, operationIdentity: identity,
    });
  }

  return Object.freeze({
    execute,
    reconcileUnresolved,
    hasUnresolvedMutation: (resourceKey) => unresolved.has(String(resourceKey)),
  });
}

export const DigitalOceanDeploymentStates = Object.freeze({
  pending: Object.freeze(["PENDING_BUILD", "BUILDING", "PENDING_DEPLOY", "DEPLOYING"]),
  success: Object.freeze(["ACTIVE"]),
  failure: Object.freeze(["ERROR", "CANCELED", "SUPERSEDED"]),
});

export const DigitalOceanActionStates = Object.freeze({
  pending: Object.freeze(["in-progress"]),
  success: Object.freeze(["completed"]),
  failure: Object.freeze(["errored"]),
});

export function pollExactDigitalOceanDeployment({ client, appId, deploymentId, ...options } = {}) {
  const expected = required(deploymentId, "deploymentId");
  return pollExactProviderResource({
    read: () => client.getDeployment({ appId, deploymentId: expected }),
    expectedIdentity: expected,
    selectIdentity: (deployment) => deployment?.id,
    selectState: (deployment) => deployment?.phase,
    ...DigitalOceanDeploymentStates,
    ...options,
  });
}

export function pollExactDigitalOceanAction({ client, actionId, ...options } = {}) {
  const expected = required(actionId, "actionId");
  return pollExactProviderResource({
    read: () => client.getAction(expected),
    expectedIdentity: expected,
    selectIdentity: (action) => action?.id,
    selectState: (action) => action?.status,
    ...DigitalOceanActionStates,
    ...options,
  });
}

/** Polls only the exact identity and fails closed on any unknown state. */
export async function pollExactProviderResource({
  read,
  expectedIdentity,
  selectIdentity,
  selectState,
  pending,
  success,
  failure,
  deadlineMs = 120_000,
  intervalMs = 1_000,
  now = () => Date.now(),
  wait = delay,
} = {}) {
  assertFunctions({ read, selectIdentity, selectState });
  const expected = required(expectedIdentity, "expectedIdentity");
  boundedInteger(deadlineMs, "deadlineMs", 1, 3_600_000);
  boundedInteger(intervalMs, "intervalMs", 1, 60_000);
  const states = {
    pending: new Set(requireStateList(pending, "pending")),
    success: new Set(requireStateList(success, "success")),
    failure: new Set(requireStateList(failure, "failure")),
  };
  const allStates = [...states.pending, ...states.success, ...states.failure];
  if (new Set(allStates).size !== allStates.length) throw new Error("Provider poll state sets must not overlap.");
  const startedAt = now();
  const deadline = startedAt + deadlineMs;
  let polls = 0;

  while (now() <= deadline) {
    polls += 1;
    const readResult = await read();
    const value = readResult?.value;
    const observedIdentity = selectIdentity(value, readResult);
    if (String(observedIdentity ?? "") !== expected) {
      throw providerFailure(ProviderResultClassification.IDENTITY_MISMATCH, "Provider polling observed the wrong exact resource identity.", {
        expectedProviderIdentity: expected,
        observedProviderIdentity: observedIdentity,
        polls,
      });
    }
    const state = String(selectState(value, readResult) ?? "");
    if (states.success.has(state)) return Object.freeze({
      classification: ProviderResultClassification.REQUEST_ACCEPTED,
      pollClassification: ProviderPollClassification.TERMINAL_SUCCESS,
      providerIdentity: expected,
      state,
      polls,
      elapsedMs: Math.max(0, now() - startedAt),
      value,
    });
    if (states.failure.has(state)) {
      throw providerFailure(ProviderResultClassification.READBACK_MISMATCH, "The exact provider operation reached a terminal failure state.", {
        providerIdentity: expected, state, polls, pollClassification: ProviderPollClassification.TERMINAL_FAILURE,
      });
    }
    if (!states.pending.has(state)) {
      throw providerFailure(ProviderResultClassification.READBACK_MISMATCH, "The exact provider operation returned an unknown state.", {
        providerIdentity: expected, state, polls,
      });
    }
    if (now() + intervalMs > deadline) break;
    if (intervalMs) await wait(intervalMs);
  }

  throw providerFailure(ProviderResultClassification.READ_FAILED, "The exact provider operation did not reach a terminal state before the bounded deadline.", {
    providerIdentity: expected,
    polls,
    elapsedMs: Math.max(0, now() - startedAt),
    pollClassification: ProviderPollClassification.DEADLINE_EXCEEDED,
  });
}

function result(value) {
  return Object.freeze(redactProviderEvidence(value));
}

function safeMutationEvidence(mutationResult) {
  if (!mutationResult) return null;
  return Object.freeze({
    classification: mutationResult.classification,
    evidence: mutationResult.evidence ?? null,
  });
}

function normalizeOperationIdentity(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("operationIdentity must be an object.");
  return Object.freeze({
    operationId: required(value.operationId, "operationIdentity.operationId"),
    commandId: value.commandId == null ? undefined : required(value.commandId, "operationIdentity.commandId"),
  });
}

function assertFunctions(values) {
  for (const [name, value] of Object.entries(values)) {
    if (typeof value !== "function") throw new Error(`${name} must be a function.`);
  }
}

function requireStateList(value, field) {
  if (!Array.isArray(value) || !value.length || value.some((entry) => !String(entry).trim())) throw new Error(`${field} must be a non-empty state list.`);
  return value.map(String);
}

function required(value, field) {
  const candidate = String(value ?? "").trim();
  if (!candidate) throw new Error(`${field} is required.`);
  return candidate;
}

function boundedInteger(value, field, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`${field} must be an integer from ${minimum} through ${maximum}.`);
  return value;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
