import { createFoundationPostgresAdapters } from "../database/foundationPostgresComposition.js";
import { createDurableOutboxWorker } from "../jobs/DurableOutboxWorker.js";
import { createNativeSandboxContinuationHandler } from "./NativeSandboxContinuationBoundary.js";
import { NATIVE_SANDBOX_WEIGHT_CONTINUATION_TOPIC } from "./NativeSandboxAuthority.js";

export function createNativeSandboxWorkerComposition({
  composition,
  buildId,
  workerId,
  logger = null,
  maximumAttempts = 8,
} = {}) {
  if (!composition?.pool || !composition?.authority || !composition?.databaseAuthority ||
      !buildId || !workerId) {
    throw new Error("Native sandbox worker composition requires isolated runtime dependencies.");
  }
  const adapters = createFoundationPostgresAdapters({
    query: (text, values) => composition.pool.query(text, values),
  });
  const continueWeight = createNativeSandboxContinuationHandler({
    authority: composition.authority,
    databaseAuthority: composition.databaseAuthority,
    handle: async (message, context) => {
      const weightEntryId = String(message.payload?.weightEntryId ?? "").trim();
      // The manual scalar Weight path (NativeSandboxManualWeightService)
      // writes canonical Weight directly with no Evidence Review, so its
      // continuation carries no reviewId - only weightEntryId is required.
      const reviewId = String(message.payload?.reviewId ?? "").trim() || null;
      if (!weightEntryId) throw invalidContinuation();
      const result = await composition.pool.query(
        `SELECT record_id FROM physiqueos.canonical_checkin_records
          WHERE owner_user_id=$1 AND collection_name='weightEntries' AND record_id=$2
          LIMIT 1`,
        [context.ownerUserId, weightEntryId],
      );
      if (result.rowCount !== 1) throw invalidContinuation();
      logger?.info?.("native.sandbox.weight_continuation.accepted", {
        authorityId: context.sandboxAuthority.authorityId,
        reviewId,
      });
      return Object.freeze({
        outcome: "sandbox-weight-visible-to-pi",
        reviewId,
        weightEntryId,
        sandboxAuthority: context.sandboxAuthority,
      });
    },
  });
  const worker = createDurableOutboxWorker({
    store: adapters.outbox,
    handlers: Object.freeze({
      [NATIVE_SANDBOX_WEIGHT_CONTINUATION_TOPIC]: continueWeight,
    }),
    workerId,
    buildId,
    logger,
    maximumAttempts,
  });
  return Object.freeze({
    workerId,
    allowedTopics: Object.freeze([NATIVE_SANDBOX_WEIGHT_CONTINUATION_TOPIC]),
    runOnce: () => worker.runOnce({
      allowedTopics: [NATIVE_SANDBOX_WEIGHT_CONTINUATION_TOPIC],
      heartbeatStatus: "healthy",
      heartbeatDetails: {
        authorityId: composition.authority.descriptor.authorityId,
        noncanonical: true,
      },
    }),
    markStopping: () => worker.markStopping(),
    isStopping: () => worker.isStopping(),
  });
}

export async function inspectNativeSandboxIntelligenceIsolation(composition) {
  if (!composition?.databaseAuthority?.assertDatabase || !composition?.pool?.query ||
      !composition?.authority?.descriptor) {
    throw new Error("Native sandbox intelligence inspection requires isolated runtime dependencies.");
  }
  const database = await composition.databaseAuthority.assertDatabase();
  const ownerUserId = composition.authority.descriptor.ownerUserId;
  const result = await composition.pool.query(
    `SELECT
       (SELECT count(*)::integer FROM physiqueos.canonical_confidence_records WHERE owner_user_id=$1) AS confidence_count,
       (SELECT count(*)::integer FROM physiqueos.canonical_briefing_records WHERE owner_user_id=$1) AS briefing_count,
       (SELECT count(*)::integer FROM physiqueos.canonical_briefing_records
          WHERE owner_user_id=$1 AND collection_name='dailyBriefings'
            AND payload->>'artifactType'='event') AS event_count,
       (SELECT count(*)::integer FROM physiqueos.canonical_goal_records WHERE owner_user_id=$1) AS goal_count,
       (SELECT count(*)::integer FROM physiqueos.canonical_checkin_records WHERE owner_user_id=$1) AS checkin_count`,
    [ownerUserId],
  );
  return Object.freeze({
    outcome: "sandbox-intelligence-stores-isolated",
    databaseName: database.databaseName,
    ownerUserId,
    stores: Object.freeze({ ...result.rows[0] }),
    cadenceScheduled: false,
  });
}

function invalidContinuation() {
  return Object.assign(new Error("The sandbox Weight continuation is incomplete."), {
    code: "NATIVE_SANDBOX_WEIGHT_CONTINUATION_INVALID",
  });
}
