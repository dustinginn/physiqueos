// APPLY mode of the October 9 2026 DEXA Event presentation republication.
//
// Built only with a Founder authorization reference AND the seal of a fresh
// read-only preview, both baked in at build time. It runs one
// executePostgresFounderRecordMutation (the system's named-record write):
// owner advisory lock, runtime authority boundary, the briefing row read FOR
// UPDATE, every sealed fact re-read with row locks and re-planned; the plan must
// reproduce the seal exactly or the transaction rolls back with nothing
// written. Otherwise one UPDATE of that row fenced on its sealed version, the
// runtime revision bump, COMMIT. Re-running after success reports
// already_applied. Executing it against production is a separate, explicitly
// authorized act.
import { applyDexaEventPresentationRepublication } from "../../src/platform/operations/DexaEventPresentationRepublication.js";
import { executePostgresFounderRecordMutation } from "../../src/platform/database/PostgresFounderRepositoryFacade.js";
import { createPostgresCombinedRuntimeAuthorityStore } from "../../src/platform/cutover/PostgresCombinedRuntimeAuthorityStore.js";
import { AUTHORIZATION_REFERENCE, SEAL, openGatedRuntime, runAndReport } from "./dexaPresentationRepublication.runtime.mjs";

const { owner, authorityEnvironment, migrationOperationId, pool } = openGatedRuntime(["apply"]);

await runAndReport(pool, async () => {
  const authorityStore = createPostgresCombinedRuntimeAuthorityStore({ pool, environment: authorityEnvironment });
  return applyDexaEventPresentationRepublication({
    executeRecordMutation: (input) => executePostgresFounderRecordMutation({
      pool, authorityStore, migrationOperationId, ...input,
    }),
    ownerUserId: owner, seal: SEAL, authorizationReference: AUTHORIZATION_REFERENCE,
    authorityEnvironment, migrationOperationId,
  });
});
