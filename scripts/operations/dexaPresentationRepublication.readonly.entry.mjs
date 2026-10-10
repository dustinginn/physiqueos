// Read-only modes of the October 9 2026 DEXA Event presentation republication.
//
// Transported into the App Platform `web` component by the accepted console
// runner (bundled to one file by buildDexaPresentationRepublicationPayload.mjs).
// This bundle contains no write path.
//
//   preview     BEGIN REPEATABLE READ READ ONLY; transaction_read_only must be on.
//               Plans the single-record rewrite and prints the seal. ROLLBACK.
//   postflight  The same read-only transaction; verifies the rewritten record and
//               everything it depends on against the seal. ROLLBACK.
import {
  loadDexaEventPresentationRepublicationFacts,
  previewDexaEventPresentationRepublication,
  verifyDexaEventPresentationRepublicationPostflight,
} from "../../src/platform/operations/DexaEventPresentationRepublication.js";
import { MODE, SEAL, openGatedRuntime, runAndReport } from "./dexaPresentationRepublication.runtime.mjs";

const { owner, authorityEnvironment, migrationOperationId, pool } = openGatedRuntime(["preview", "postflight"]);

await runAndReport(pool, async () => {
  const client = await pool.connect();
  let open = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    open = true;
    const readOnly = (await client.query("SHOW transaction_read_only")).rows[0]?.transaction_read_only;
    if (readOnly !== "on") throw Object.assign(new Error("read-only fence"), { code: "TRANSACTION_NOT_READ_ONLY" });
    const query = (text, values) => client.query(text, values);
    let result;
    if (MODE === "postflight") {
      const facts = await loadDexaEventPresentationRepublicationFacts({ query, ownerUserId: owner, authorityEnvironment });
      result = { mode: MODE, ...verifyDexaEventPresentationRepublicationPostflight({
        facts, seal: SEAL, ownerUserId: owner, otherBriefingsAtSeal: SEAL.otherBriefings ?? null,
      }) };
    } else {
      result = await previewDexaEventPresentationRepublication({
        query, ownerUserId: owner, authorityEnvironment, migrationOperationId,
      });
    }
    await client.query("ROLLBACK");
    open = false;
    return result;
  } finally {
    if (open) await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
});
