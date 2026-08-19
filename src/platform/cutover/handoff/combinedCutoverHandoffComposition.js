// Lazy production wiring for the combined-cutover handoff STATUS service. Mirrors Phase 3/4's
// composition pattern: resolved only when explicitly enabled, fails closed on missing
// configuration, and does nothing at import time so importing this module never opens a database
// connection. Manages its own PostgreSQL pool, independent of the transfer/preparation
// compositions', so each phase remains independently enableable.
//
// COMPATIBILITY-MODE ENFORCEMENT. Authority handoff is the single most sensitive combined-cutover
// capability, so - beyond the dedicated enable flag every combined-cutover channel already requires
// (which alone means Windows, which never sets it, is already rejected) - this composition
// additionally refuses to activate when `PHYSIQUEOS_PROVIDER_COMPATIBILITY_MODE=1`. A compatibility
// runtime is explicitly non-authoritative for production
// (`CombinedRuntimeAuthorityState.js`'s `provider-compatibility-nonauthoritative` branch) and must
// never be able to observe or influence real authority-handoff evidence, even read-only.
//
// This composition only wires the read-only status service - see
// `ProductionAuthorityHandoffService.js`'s header for why the actual transition has no HTTP surface
// at all and must be constructed in-process wherever the orchestrator itself runs.

import { readDatabaseConfig } from "../../database/config.js";
import { createPostgresPool } from "../../database/pool.js";
import { createPostgresCombinedCutoverHandoffReceiptStore } from "./PostgresCombinedCutoverHandoffReceiptStore.js";
import { createCombinedCutoverHandoffService } from "./combinedCutoverHandoffService.js";
import { readCombinedCutoverHandoffAuthConfig, isCombinedCutoverHandoffEnabled } from "./combinedCutoverHandoffAuth.js";

let resolved = null;

function resolve(env) {
  if (resolved) return resolved;
  if (env.PHYSIQUEOS_PROVIDER_COMPATIBILITY_MODE === "1") {
    throw new Error("The combined-cutover handoff channel is unavailable in provider-compatibility mode.");
  }
  const databaseConfig = readDatabaseConfig(env);
  if (!databaseConfig.enabled) throw new Error("The combined-cutover handoff channel requires database configuration.");
  const pool = createPostgresPool(databaseConfig);
  const handoffReceiptStore = createPostgresCombinedCutoverHandoffReceiptStore({ pool });
  resolved = Object.freeze({ pool, handoffReceiptStore });
  return resolved;
}

export function getCombinedCutoverHandoffService(env = process.env) {
  if (!isCombinedCutoverHandoffEnabled(env)) return null;
  const authConfig = readCombinedCutoverHandoffAuthConfig(env);
  const { handoffReceiptStore } = resolve(env);
  return createCombinedCutoverHandoffService({ handoffReceiptStore, authConfig });
}

export async function closeCombinedCutoverHandoffComposition() {
  const current = resolved;
  resolved = null;
  await current?.pool?.end?.();
}
