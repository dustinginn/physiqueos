import { randomUUID } from "node:crypto";
import { canonicalJson } from "../../contracts/v1/canonicalJson.js";
import {
  createFounderStoreUnitOfWork,
  FounderStoreUnitOfWorkError,
  getFounderStoreRevision,
} from "../../data/repositories/FounderStoreUnitOfWork.js";
import {
  getFounderRuntimeStore,
  resolveFounderRuntimeStorePath,
} from "../../data/repositories/founderRuntimeStore.js";

export async function loadApplicationCanonicalRuntime() {
  if (process.env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME !== "1") {
    return structuredClone(getFounderRuntimeStore());
  }
  const composition = await providerComposition();
  if (typeof composition.loadRuntime !== "function") throw unavailable("read");
  return structuredClone(await composition.loadRuntime());
}

export function createApplicationRuntimeBindings() {
  if (process.env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME !== "1") {
    return {
      runtimeStorePath: resolveFounderRuntimeStorePath(),
      liveStore: getFounderRuntimeStore(),
      readPersistedStore: undefined,
      createUnitOfWork: createFounderStoreUnitOfWork,
    };
  }
  const liveStore = {};
  return {
    runtimeStorePath: "/tmp/physiqueos-provider-transaction.json",
    liveStore,
    async readPersistedStore() {
      const runtime = await loadApplicationCanonicalRuntime();
      publish(liveStore, runtime);
      return structuredClone(runtime);
    },
    createUnitOfWork(options) {
      return createProviderFounderStoreUnitOfWork({ ...options, liveStore });
    },
  };
}

export async function loadApplicationRuntimeBindings() {
  const bindings = createApplicationRuntimeBindings();
  if (process.env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME === "1") {
    await bindings.readPersistedStore();
  }
  return bindings;
}

export function createProviderFounderStoreUnitOfWork({
  liveStore,
  stageFrom = liveStore,
  now = () => new Date(),
  createCommitId = () => randomUUID(),
  binding = {},
  lockContext = {},
} = {}) {
  if (process.env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME !== "1") {
    throw unavailable("unit-of-work construction");
  }
  return {
    binding: Object.freeze({ ...binding, storeKind: "postgres-canonical", isolated: false, productionAllowed: true }),
    capabilities: Object.freeze({ crossRepositoryTransaction: true, atomicCommit: true, rollback: true, stagedWrites: true, revisionLocking: true, crossProcessLocking: true }),
    begin() {
      const baseline = structuredClone(stageFrom);
      const expectedRevision = getFounderStoreRevision(baseline);
      const stagedState = structuredClone(baseline);
      let status = "open";
      let callbackResult;
      const assertOpen = () => {
        if (status !== "open") throw new FounderStoreUnitOfWorkError("TRANSACTION_CLOSED", "The provider Founder transaction is closed.", { expectedRevision });
      };
      return {
        get status() { return status; },
        expectedRevision,
        transactionId: randomUUID(),
        inspect() { assertOpen(); return structuredClone(stagedState); },
        async mutate(callback) {
          assertOpen();
          callbackResult = await callback?.(stagedState);
          return callbackResult;
        },
        abort() { assertOpen(); status = "aborted"; return { status }; },
        async commit({ validate, finalizeCandidate, validateFinalized } = {}) {
          assertOpen();
          status = "committing";
          const commitId = createCommitId();
          try {
            if (typeof validate === "function") assertValid(await validate(structuredClone(stagedState)), "Founder-store staged validation rejected the provider transaction.");
            const candidate = structuredClone(stagedState);
            candidate.revision = expectedRevision + 1;
            candidate.updatedAt = now().toISOString();
            candidate.lastCommitId = commitId;
            await finalizeCandidate?.({ stagedState: candidate, expectedRevision, candidateRevision: candidate.revision, commitId });
            if (typeof validateFinalized === "function") assertValid(await validateFinalized(structuredClone(candidate), { expectedRevision, candidateRevision: candidate.revision, commitId }), "Finalized provider candidate was rejected.");
            const composition = await providerComposition();
            if (typeof composition.mutateRuntime !== "function") throw unavailable("mutation");
            await composition.mutateRuntime({
              commandId: commitId,
              operation: lockContext.operation ?? "founder-unit-of-work",
              expectedRuntime: baseline,
              mutate(runtime) {
                publish(runtime, candidate);
              },
            });
            publish(liveStore, candidate);
            status = "committed";
            return Object.freeze({ status, committed: true, expectedRevision, revision: candidate.revision, commitId, result: callbackResult, warnings: Object.freeze([]) });
          } catch (cause) {
            status = "aborted";
            if (cause instanceof FounderStoreUnitOfWorkError) throw cause;
            throw new FounderStoreUnitOfWorkError(cause.code ?? "PERSISTENCE_FAILED", cause.message, { cause, expectedRevision, commitId });
          }
        },
      };
    },
  };
}

async function providerComposition() {
  const { getProductionApplicationComposition } = await import("../composition/productionApplicationComposition.js");
  return getProductionApplicationComposition();
}

function publish(target, source) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, structuredClone(source));
}

function assertValid(result, message) {
  if (result === false || result?.valid === false) {
    throw new FounderStoreUnitOfWorkError("VALIDATION_FAILED", message);
  }
}

function unavailable(operation) {
  const error = new Error(`Provider canonical runtime ${operation} is unavailable.`);
  error.code = "PROVIDER_CANONICAL_RUNTIME_UNAVAILABLE";
  return error;
}

export function canonicalRuntimeFingerprint(runtime) {
  return canonicalJson(runtime);
}
