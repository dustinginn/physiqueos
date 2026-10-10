import { createHash } from "node:crypto";
import { resolveRecoveryBriefingPublicationAuthorityV1 } from "../../domain/services/RecoveryBriefingPublicationV1.js";
import {
  RECOVERY_BRIEFING_CADENCES,
  RECOVERY_BRIEFING_PUBLICATION_AUTHORITY_VERSION,
} from "../../domain/services/RecoveryBriefingPolicyV1.js";
import {
  HEALTHKIT_SLEEP_ACTIVATION_POLICY_RECORD_ID,
  HEALTHKIT_SLEEP_CANONICAL_ALGORITHM_POLICY_RECORD_ID,
  resolveHealthKitSleepActivationPolicy,
  resolveHealthKitSleepCanonicalAlgorithmPolicy,
} from "../../domain/services/HealthKitSleepPolicies.js";
import { HEALTHKIT_SLEEP_CONFIGURATION_COLLECTION } from "../../domain/services/HealthKitSleepContract.js";
import {
  RECOVERY_BRIEFING_PUBLICATION_AUTHORITY_COLLECTION,
  RECOVERY_BRIEFING_PUBLICATION_AUTHORITY_RECORD_ID,
} from "../database/RecoverySleepInputReaderV1.js";

/**
 * Recovery Briefing V1 publication authority — the ONLY writer of the
 * `recovery_briefing_publication_authority` record the deployed composer reads
 * (absent = OFF). Single record, no audit row: the authorization reference is
 * part of the record itself.
 *
 *   preview          read-only. Validates the desired record with the DEPLOYED
 *                    resolver plus stricter operational rules, reads the live
 *                    facts, and returns the exact record and a seal.
 *   apply            create-only. Needs the preview's seal and a matching
 *                    authorization reference; refuses on any drift, an existing
 *                    or duplicate authority, or a resolver mismatch; writes
 *                    exactly one record with putIfAbsent and verifies it in the
 *                    same transaction.
 *   postverify       read-only. Exactly one authority row, resolving enabled to
 *                    the sealed values, and nothing else changed.
 *   disable-preview  read-only plan for the prospective rollback.
 *   disable          sets `status: "disabled"` on the existing record with an
 *                    optimistic version check. Future Weekly/Monthly briefings
 *                    then carry no Recovery; already-published cards are
 *                    immutable and stay as they are (no deletion, no rewrite).
 *
 * Building a payload or running preview/postverify writes nothing. Running
 * apply or disable in production is a separate, explicitly Founder-authorized
 * act through the accepted console runner.
 */
export const RECOVERY_PUBLICATION_AUTHORITY_RUNNER_VERSION = "recovery_publication_authority_runner_v1";

// Founder-proposed activation values (2026-10-10), for later review. Writing
// them is NOT authorized by this code; the authorizationRef is supplied at apply.
export const RECOVERY_PUBLICATION_AUTHORITY_PROPOSAL_V1 = Object.freeze({
  cadences: Object.freeze(["weekly", "monthly"]),
  effectiveFromPeriodStart: "2026-10-18",
  recoveryEffectiveSleepDay: "2026-10-02",
});

export const RecoveryAuthorityAction = Object.freeze({
  PREVIEW: "preview",
  APPLY: "apply",
  POSTVERIFY: "postverify",
  DISABLE_PREVIEW: "disable-preview",
  DISABLE: "disable",
});

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,199}$/;
const BRIEFING_COLLECTION = "dailyBriefings";
const RECURRING = Object.freeze(["weekly", "monthly"]);

/**
 * @param records Phase-4 canonical record store (get/list/putIfAbsent/put),
 *   bound to the caller's transaction.
 * @param authorization `{ ownerUserId, authorizationReference }`
 * @param censusAuthorityRows async () => [{ table, collection, recordId }]:
 *   every owner row whose record id names the Recovery publication authority,
 *   across ALL canonical tables (the entry implements it with bounded SQL).
 * @param runtimeSha the deployed SHA the entry verified before any read.
 */
export async function runRecoveryPublicationAuthority({
  records,
  authorization,
  censusAuthorityRows,
  runtimeSha,
  action = RecoveryAuthorityAction.PREVIEW,
  desired = RECOVERY_PUBLICATION_AUTHORITY_PROPOSAL_V1,
  expectedSeal = null,
  expectedRecordDigest = null,
  timeZone = "America/Los_Angeles",
  now = () => new Date(),
} = {}) {
  const ownerUserId = authorization?.ownerUserId;
  if (!ownerUserId) throw operationError("An owner is required.", "OWNER_REQUIRED");
  if (!/^[0-9a-f]{40}$/.test(String(runtimeSha ?? ""))) throw operationError("The verified runtime SHA is required.", "RUNTIME_SHA_REQUIRED");
  if (typeof censusAuthorityRows !== "function") throw operationError("An authority census is required.", "AUTHORITY_CENSUS_REQUIRED");
  if (!Object.values(RecoveryAuthorityAction).includes(action)) throw operationError("Unknown action.", "ACTION_INVALID");

  const facts = await collectFacts({ records, ownerUserId, censusAuthorityRows, runtimeSha });
  const at = now();

  if (action === RecoveryAuthorityAction.POSTVERIFY) {
    const failures = verifyEnabledAuthority({ facts, expectedRecordDigest });
    return Object.freeze({ outcome: failures.length ? "verification_failed" : "verified", failures, facts: publicFacts(facts) });
  }

  if (action === RecoveryAuthorityAction.DISABLE_PREVIEW || action === RecoveryAuthorityAction.DISABLE) {
    return disableAuthority({ records, ownerUserId, authorization, facts, action, expectedSeal, censusAuthorityRows, runtimeSha, at });
  }

  const planned = planAuthorityRecord({ desired, authorizationReference: authorization.authorizationReference, facts, at, timeZone });
  if (planned.refusals.length) {
    return Object.freeze({ outcome: "refused", reasons: planned.refusals, facts: publicFacts(facts) });
  }
  const seal = sealOf({ action: "create", runtimeSha, ownerUserId, facts, record: planned.record });
  const summary = {
    plan: {
      operation: "create",
      collection: RECOVERY_BRIEFING_PUBLICATION_AUTHORITY_COLLECTION,
      recordId: RECOVERY_BRIEFING_PUBLICATION_AUTHORITY_RECORD_ID,
      record: planned.record,
      recordDigest: digest(planned.record),
      resolvesTo: planned.resolved,
      firstCoveredPeriods: firstCoveredPeriods(planned.record),
    },
    seal,
    predictedMutations: [{
      collection: RECOVERY_BRIEFING_PUBLICATION_AUTHORITY_COLLECTION,
      recordId: RECOVERY_BRIEFING_PUBLICATION_AUTHORITY_RECORD_ID,
      operation: "create",
    }],
    unchangedByDesign: {
      briefings: "no artifact is created, regenerated or rewritten; Recovery attaches only to NEW Weekly/Monthly occurrences",
      sleep: "no Sleep record or Sleep policy is written",
      confidence: "no Goal/Strategy Confidence, V3, narrative or recommendation input changes",
      cadences: "Midweek, DEXA, Photo and every other briefing type stay excluded by the deployed code",
    },
    facts: publicFacts(facts),
  };
  if (action === RecoveryAuthorityAction.PREVIEW) return Object.freeze({ outcome: "preview", ...summary });

  // APPLY: create-only, sealed, authorized.
  if (!expectedSeal || expectedSeal !== seal) {
    return Object.freeze({ outcome: "drifted", reasons: ["stale_or_missing_seal"], facts: publicFacts(facts) });
  }
  if (String(authorization.authorizationReference ?? "").trim() !== planned.record.authorizationRef) {
    throw operationError("The authorization reference must equal the sealed record's.", "AUTHORIZATION_REFERENCE_MISMATCH");
  }
  const payload = { ...planned.record, enabledAt: at.toISOString() };
  const created = await records.putIfAbsent({
    ownerUserId,
    collection: RECOVERY_BRIEFING_PUBLICATION_AUTHORITY_COLLECTION,
    recordId: RECOVERY_BRIEFING_PUBLICATION_AUTHORITY_RECORD_ID,
    payload,
    sourceIdentity: RECOVERY_BRIEFING_PUBLICATION_AUTHORITY_RECORD_ID,
  });
  if (created?.created !== true) {
    throw operationError("A Recovery authority appeared concurrently.", "AUTHORITY_CREATE_CONFLICT");
  }
  const after = await collectFacts({ records, ownerUserId, censusAuthorityRows, runtimeSha });
  const failures = [
    ...verifyEnabledAuthority({ facts: after, expectedRecordDigest: digest(planned.record) }),
    ...unchangedOutsideAuthority(facts, after),
  ];
  if (failures.length) {
    throw operationError(`Post-write verification failed: ${failures.join(", ")}`, "POST_WRITE_VERIFICATION_FAILED");
  }
  return Object.freeze({ outcome: "applied", ...summary, writes: 1, facts: publicFacts(after) });
}

/** The exact record a preview would create, validated with the deployed resolver. */
export function planAuthorityRecord({ desired, authorizationReference, facts, at, timeZone = "America/Los_Angeles" }) {
  const refusals = [];
  const cadences = Array.isArray(desired?.cadences) ? desired.cadences : [];
  if (!cadences.length || new Set(cadences).size !== cadences.length ||
      cadences.some((cadence) => !RECOVERY_BRIEFING_CADENCES.includes(cadence))) {
    refusals.push("cadences_invalid");
  }
  const effectiveFrom = desired?.effectiveFromPeriodStart;
  const recoveryFloor = desired?.recoveryEffectiveSleepDay;
  if (!isDate(effectiveFrom) || !isDate(recoveryFloor)) refusals.push("dates_invalid");
  const reference = String(authorizationReference ?? "").trim();
  if (!REFERENCE.test(reference)) refusals.push("authorization_ref_invalid");

  // Duplicate / existing authority: create-only.
  if (facts.authority.present) refusals.push("authority_already_present");
  if (facts.census.unexpected.length) refusals.push("unexpected_authority_rows");

  // The Sleep inputs Recovery depends on must be live and consistent.
  const { activation, algorithm } = facts.sleepPolicies;
  if (!activation.enabled || activation.mode !== "validation_only" || activation.endSleepDay !== null) {
    refusals.push("sleep_activation_not_prospective_validation_only");
  }
  if (!algorithm.enabled || algorithm.algorithmVersion !== "sleep-canon-v3") refusals.push("sleep_canon_v3_not_enabled");

  if (!refusals.includes("dates_invalid")) {
    const sleepFloor = [activation.effectiveSleepDay, algorithm.effectiveSleepDay].filter(isDate).sort().at(-1) ?? null;
    if (!sleepFloor || recoveryFloor < sleepFloor) refusals.push("recovery_effective_sleep_day_before_sleep_floor");
    if (effectiveFrom <= recoveryFloor) refusals.push("effective_period_not_after_sleep_floor");
    const weekly = cadences.includes("weekly");
    if (weekly ? weekday(effectiveFrom) !== 0 : effectiveFrom.slice(8) !== "01") {
      refusals.push("effective_period_start_not_a_period_boundary");
    }
    // No historical reach: the first covered period must be strictly after
    // every Weekly/Monthly window already published, and must not have closed.
    const latest = facts.briefings.latestWindowStart;
    if (latest && effectiveFrom <= latest) refusals.push("effective_period_already_published");
    const firstEnd = weekly ? shift(effectiveFrom, 6) : lastOfMonth(effectiveFrom);
    if (firstEnd < localDate(at, timeZone)) refusals.push("first_covered_period_already_closed");
  }
  if (refusals.length) return { refusals, record: null, resolved: null };

  const record = {
    id: RECOVERY_BRIEFING_PUBLICATION_AUTHORITY_RECORD_ID,
    schemaVersion: RECOVERY_BRIEFING_PUBLICATION_AUTHORITY_VERSION,
    status: "enabled",
    cadences: RECURRING.filter((cadence) => cadences.includes(cadence)),
    effectiveFromPeriodStart: effectiveFrom,
    recoveryEffectiveSleepDay: recoveryFloor,
    strategicEvidenceEligibility: "excluded",
    historicalBackfill: false,
    artifactRewrite: false,
    publishBeforeBaselineEligible: false,
    authorizationRef: reference,
    provenance: { source: RECOVERY_PUBLICATION_AUTHORITY_RUNNER_VERSION },
  };
  // Production parity: the record must resolve, through the deployed resolver,
  // to exactly these values.
  const resolved = resolveRecoveryBriefingPublicationAuthorityV1(record);
  if (!resolved.enabled || JSON.stringify(resolved.cadences) !== JSON.stringify(record.cadences) ||
      resolved.effectiveFromPeriodStart !== effectiveFrom || resolved.recoveryEffectiveSleepDay !== recoveryFloor ||
      resolved.authorizationRef !== reference) {
    return { refusals: [`resolver_rejected:${resolved.invalidReason ?? "mismatch"}`], record: null, resolved };
  }
  return { refusals, record, resolved };
}

async function disableAuthority({ records, ownerUserId, authorization, facts, action, expectedSeal, censusAuthorityRows, runtimeSha, at }) {
  const refusals = [];
  if (!facts.authority.present) refusals.push("authority_absent");
  else if (!facts.authority.resolution.enabled) refusals.push("authority_not_enabled");
  if (facts.census.unexpected.length) refusals.push("unexpected_authority_rows");
  const reference = String(authorization.authorizationReference ?? "").trim();
  if (!REFERENCE.test(reference)) refusals.push("authorization_ref_invalid");
  if (refusals.length) return Object.freeze({ outcome: "refused", reasons: refusals, facts: publicFacts(facts) });

  const { version, ...existing } = facts.authority.record;
  const record = { ...existing, status: "disabled", disableAuthorizationRef: reference };
  const seal = sealOf({ action: "disable", runtimeSha, ownerUserId, facts, record });
  const summary = {
    plan: {
      operation: "update",
      collection: RECOVERY_BRIEFING_PUBLICATION_AUTHORITY_COLLECTION,
      recordId: RECOVERY_BRIEFING_PUBLICATION_AUTHORITY_RECORD_ID,
      expectedVersion: version ?? null,
      record,
      resolvesTo: resolveRecoveryBriefingPublicationAuthorityV1(record),
      effect: "prospective: future Weekly/Monthly carry no Recovery; published cards are immutable and unchanged",
    },
    seal,
    facts: publicFacts(facts),
  };
  if (action === RecoveryAuthorityAction.DISABLE_PREVIEW) return Object.freeze({ outcome: "disable_preview", ...summary });
  if (!expectedSeal || expectedSeal !== seal) {
    return Object.freeze({ outcome: "drifted", reasons: ["stale_or_missing_seal"], facts: publicFacts(facts) });
  }
  await records.put({
    ownerUserId,
    collection: RECOVERY_BRIEFING_PUBLICATION_AUTHORITY_COLLECTION,
    recordId: RECOVERY_BRIEFING_PUBLICATION_AUTHORITY_RECORD_ID,
    expectedVersion: version ?? 1,
    payload: { ...record, disabledAt: at.toISOString() },
    sourceIdentity: RECOVERY_BRIEFING_PUBLICATION_AUTHORITY_RECORD_ID,
  });
  const after = await collectFacts({ records, ownerUserId, censusAuthorityRows, runtimeSha });
  const failures = [
    after.authority.resolution.enabled ? "authority_still_enabled" : null,
    after.authority.resolution.invalidReason !== "recovery_publication_authority_disabled" ? "authority_not_disabled" : null,
    after.census.unexpected.length ? "unexpected_authority_rows" : null,
    ...unchangedOutsideAuthority(facts, after),
  ].filter(Boolean);
  if (failures.length) {
    throw operationError(`Post-write verification failed: ${failures.join(", ")}`, "POST_WRITE_VERIFICATION_FAILED");
  }
  return Object.freeze({ outcome: "disabled", ...summary, writes: 1, facts: publicFacts(after) });
}

async function collectFacts({ records, ownerUserId, censusAuthorityRows, runtimeSha }) {
  const configuration = (collection, recordId) => records.get({ ownerUserId, collection, recordId });
  const [authorityRecord, activationRecord, algorithmRecord, briefings, census] = await Promise.all([
    configuration(RECOVERY_BRIEFING_PUBLICATION_AUTHORITY_COLLECTION, RECOVERY_BRIEFING_PUBLICATION_AUTHORITY_RECORD_ID),
    configuration(HEALTHKIT_SLEEP_CONFIGURATION_COLLECTION, HEALTHKIT_SLEEP_ACTIVATION_POLICY_RECORD_ID),
    configuration(HEALTHKIT_SLEEP_CONFIGURATION_COLLECTION, HEALTHKIT_SLEEP_CANONICAL_ALGORITHM_POLICY_RECORD_ID),
    records.list({ ownerUserId, collection: BRIEFING_COLLECTION }),
    censusAuthorityRows(),
  ]);
  const activation = resolveHealthKitSleepActivationPolicy(activationRecord);
  const algorithm = resolveHealthKitSleepCanonicalAlgorithmPolicy(algorithmRecord);
  const recurring = (briefings ?? []).map((item) => item?.payload ?? item)
    .filter((item) => RECURRING.includes(item?.cadence) && item?.artifactType !== "event");
  const exact = (row) => row?.collection === RECOVERY_BRIEFING_PUBLICATION_AUTHORITY_COLLECTION &&
    row?.recordId === RECOVERY_BRIEFING_PUBLICATION_AUTHORITY_RECORD_ID;
  const rows = Array.isArray(census) ? census : [];
  return {
    runtimeSha,
    ownerUserId,
    authority: {
      present: Boolean(authorityRecord),
      record: authorityRecord ? structuredClone(authorityRecord) : null,
      digest: authorityRecord ? digest(withoutVersion(authorityRecord)) : null,
      resolution: resolveRecoveryBriefingPublicationAuthorityV1(authorityRecord ?? null),
    },
    census: {
      exactRows: rows.filter(exact).length,
      unexpected: rows.filter((row) => !exact(row)).map((row) => ({ table: row.table, collection: row.collection })),
    },
    sleepPolicies: {
      activation: { enabled: activation.enabled === true, mode: activation.mode ?? null, effectiveSleepDay: activation.effectiveSleepDay ?? null, endSleepDay: activation.endSleepDay ?? null },
      algorithm: { enabled: algorithm.enabled === true, algorithmVersion: algorithm.algorithmVersion ?? null, effectiveSleepDay: algorithm.effectiveSleepDay ?? null },
      activationDigest: activationRecord ? digest(withoutVersion(activationRecord)) : null,
      algorithmDigest: algorithmRecord ? digest(withoutVersion(algorithmRecord)) : null,
    },
    briefings: {
      recurringCount: recurring.length,
      latestWindowStart: recurring.map((item) => item.evidenceWindow?.startDate).filter(isDate).sort().at(-1) ?? null,
      withRecoveryAssessment: recurring.filter((item) => Object.prototype.hasOwnProperty.call(item?.briefing ?? {}, "recoveryAssessment")).length,
      digest: digest(recurring.map((item) => [item.id ?? null, item.version ?? null]).sort()),
    },
  };
}

function verifyEnabledAuthority({ facts, expectedRecordDigest }) {
  const failures = [];
  if (!facts.authority.present) failures.push("authority_absent");
  if (facts.census.exactRows !== 1) failures.push(`authority_row_count:${facts.census.exactRows}`);
  if (facts.census.unexpected.length) failures.push("unexpected_authority_rows");
  if (!facts.authority.resolution.enabled) failures.push(`authority_not_enabled:${facts.authority.resolution.invalidReason}`);
  if (facts.authority.present) {
    const { version: _version, enabledAt: _enabledAt, ...stored } = facts.authority.record;
    if (!expectedRecordDigest) failures.push("expected_record_digest_missing");
    else if (digest(stored) !== expectedRecordDigest) failures.push("authority_record_differs_from_sealed_plan");
  }
  return failures;
}

function unchangedOutsideAuthority(before, after) {
  return [
    before.sleepPolicies.activationDigest !== after.sleepPolicies.activationDigest ? "sleep_activation_policy_changed" : null,
    before.sleepPolicies.algorithmDigest !== after.sleepPolicies.algorithmDigest ? "sleep_algorithm_policy_changed" : null,
    before.briefings.digest !== after.briefings.digest ? "briefings_changed" : null,
  ].filter(Boolean);
}

function publicFacts(facts) {
  return {
    runtimeSha: facts.runtimeSha,
    authority: {
      present: facts.authority.present,
      digest: facts.authority.digest,
      enabled: facts.authority.resolution.enabled,
      invalidReason: facts.authority.resolution.invalidReason,
      cadences: facts.authority.resolution.cadences,
      effectiveFromPeriodStart: facts.authority.resolution.effectiveFromPeriodStart,
    },
    census: facts.census,
    sleepPolicies: facts.sleepPolicies,
    briefings: facts.briefings,
  };
}

function firstCoveredPeriods(record) {
  const out = {};
  if (record.cadences.includes("weekly")) {
    out.weekly = { startDate: record.effectiveFromPeriodStart, endDate: shift(record.effectiveFromPeriodStart, 6) };
  }
  if (record.cadences.includes("monthly")) {
    const month = record.effectiveFromPeriodStart.slice(8) === "01"
      ? record.effectiveFromPeriodStart.slice(0, 7)
      : nextMonth(record.effectiveFromPeriodStart.slice(0, 7));
    out.monthly = { startDate: `${month}-01`, endDate: lastOfMonth(`${month}-01`) };
  }
  return out;
}

function sealOf(value) {
  return `seal_${digest(value)}`;
}

function withoutVersion(record) {
  const { version: _version, ...rest } = record ?? {};
  return rest;
}

function digest(value) {
  return createHash("sha256").update(stableSerialize(value)).digest("hex").slice(0, 32);
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function isDate(value) {
  if (!DATE.test(String(value ?? ""))) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function shift(value, amount) {
  return new Date(Date.parse(`${value}T12:00:00Z`) + amount * 86_400_000).toISOString().slice(0, 10);
}

function weekday(value) {
  return new Date(`${value}T12:00:00Z`).getUTCDay();
}

function nextMonth(month) {
  const [year, value] = month.split("-").map(Number);
  return value === 12 ? `${year + 1}-01` : `${year}-${String(value + 1).padStart(2, "0")}`;
}

function lastOfMonth(date) {
  return shift(`${nextMonth(date.slice(0, 7))}-01`, -1);
}

function localDate(instant, timeZone) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

function operationError(message, code) {
  return Object.assign(new Error(message), { code });
}
