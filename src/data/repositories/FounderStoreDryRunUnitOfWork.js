import { getFounderStoreRevision } from "./FounderStoreUnitOfWork";

export function createFounderStoreDryRunCapture() {
  let candidate = null;
  return Object.freeze({
    set(value) { candidate = structuredClone(value); },
    get() { return candidate == null ? null : structuredClone(candidate); },
  });
}

export function createFounderStoreDryRunUnitOfWork({
  stageFrom,
  liveStore,
  validatePersistedBaseline = null,
  now = () => new Date(),
  capture,
} = {}) {
  const baseline = structuredClone(stageFrom ?? liveStore);
  if (!baseline || !capture?.set) {
    throw new TypeError("Founder-store dry run requires an isolated baseline and capture.");
  }
  return Object.freeze({
    binding: Object.freeze({ storeIdentity: "founder_store_dry_run",
      storeKind: "isolated_dry_run", isolated: true, productionAllowed: false }),
    capabilities: Object.freeze({ crossRepositoryTransaction: true, atomicCommit: false,
      rollback: true, stagedWrites: true, revisionLocking: true,
      persistenceErrorsPropagate: true, crossProcessLocking: true, dryRun: true }),
    begin() {
      const expectedRevision = getFounderStoreRevision(baseline);
      const stagedState = structuredClone(baseline);
      let status = "open";
      let callbackResult;
      const assertOpen = () => {
        if (status !== "open") throw new Error("Founder-store dry-run transaction is closed.");
      };
      return {
        get status() { return status; },
        transactionId: "phase_review_dry_run_transaction",
        expectedRevision,
        inspect() { assertOpen(); return structuredClone(stagedState); },
        async mutate(callback) { assertOpen(); callbackResult = await callback(stagedState);
          return callbackResult; },
        abort() { assertOpen(); status = "aborted"; return { status }; },
        async commit({ validate, finalizeCandidate, validateFinalized } = {}) {
          assertOpen();
          if (typeof validatePersistedBaseline === "function") {
            const valid = await validatePersistedBaseline(structuredClone(baseline));
            if (valid === false || valid?.valid === false) throw new Error("Dry-run baseline validation failed.");
          }
          if (typeof validate === "function") {
            const valid = await validate(structuredClone(stagedState));
            if (valid === false || valid?.valid === false) throw new Error("Dry-run candidate validation failed.");
          }
          const candidate = structuredClone(stagedState);
          candidate.revision = expectedRevision + 1;
          candidate.updatedAt = now().toISOString();
          candidate.lastCommitId = "phase_review_dry_run_commit";
          const context = { expectedRevision, candidateRevision: candidate.revision,
            commitId: candidate.lastCommitId };
          if (typeof finalizeCandidate === "function") {
            await finalizeCandidate({ stagedState: candidate, ...context });
          }
          if (typeof validateFinalized === "function") {
            const valid = await validateFinalized(structuredClone(candidate), context);
            if (valid === false || valid?.valid === false) throw new Error("Final dry-run candidate validation failed.");
          }
          capture.set(candidate);
          status = "committed";
          return Object.freeze({ status, committed: true, dryRun: true,
            expectedRevision, revision: candidate.revision,
            commitId: candidate.lastCommitId, result: callbackResult, warnings: Object.freeze([]) });
        },
      };
    },
  });
}
