import { SEP_13_FALSE_SUPERSESSION_TARGET } from "../../domain/services/TrainingFalseSupersessionCorrectionService.js";
import { APPROVED_RETROACTIVE_TRAINING_EVENTS } from "./trainingAuthorityApprovedEvents.js";

/**
 * The exact, single authorization for the bounded Founder Training historical repair.
 * Founder decisions (2026-09-21):
 *  1. APPROVED  Sep 13 canonical correction: one immutable correction revision built from the
 *               original `@503` record (never `@518`, never a reactivation).
 *  2. APPROVED  the 12 proven retroactive durable performance events, after (1) is verified.
 *  3. DECLINED  Sep 15 telemetry restoration. Nothing here touches the Sep 15 session.
 *  4. Weekly/V3 regeneration is NOT part of this authorization; it is gated on a separate
 *     Photo-lineage dry run.
 * Nothing in this file executes anything.
 */
export const TRAINING_AUTHORITY_REPAIR_AUTHORIZATION = Object.freeze({
  repairId: "training-authority-repair-2026-09-21-v1",
  ownerUserId: "user_founder_001",
  expectedProductionSha: "895935bdbec80b11f85ef979df44bd6fba14575f",
  sep13Correction: SEP_13_FALSE_SUPERSESSION_TARGET,
  approvedEvents: APPROVED_RETROACTIVE_TRAINING_EVENTS,
  declined: Object.freeze({ sep15TelemetryRestoration: true }),
  authorizedBy: "founder",
  basis: "Founder decisions for the bounded Training historical repair: approve the Sep 13 canonical correction and the 12 proven retroactive events; decline Sep 15 telemetry.",
});
