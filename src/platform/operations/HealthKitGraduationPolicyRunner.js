import { createHash } from "node:crypto";
import {
  HEALTHKIT_CANONICAL_ACTIVATION_POLICY_RECORD_ID,
  HEALTHKIT_WORKOUT_ACTIVATION_POLICY_RECORD_ID,
} from "../../domain/services/HealthKitObservationService.js";
import {
  HEALTHKIT_CANONICAL_DAY_COLLECTION,
  HEALTHKIT_GRADUATION_CONFIGURATION_COLLECTION,
  HEALTHKIT_GRADUATION_POLICY_RECORD_ID,
  HEALTHKIT_GRADUATION_POLICY_SCHEMA_VERSION,
  HealthKitGraduationPurpose,
  overlayGraduatedHealthKitDays,
  resolveHealthKitGraduationPolicy,
} from "../../domain/services/HealthKitGraduation.js";
import { HEALTHKIT_CANONICAL_WORKOUT_COLLECTION } from "../../domain/services/HealthKitWorkoutService.js";
import { HEALTHKIT_WORKOUT_LINK_COLLECTION } from "../../domain/services/HealthKitWorkoutLinkService.js";
import { HEALTHKIT_WORKOUT_LINK_CLAIM_COLLECTION } from "../../domain/services/HealthKitWorkoutRelationshipService.js";
import { selectActiveCanonicalActivityDays } from "../../domain/services/CanonicalActivityDayService.js";
import { selectActiveCanonicalNutritionDays } from "../../domain/services/CanonicalNutritionDayService.js";
import { resolveNutritionDayAuthority } from "../../domain/models/nutritionDayAuthority.js";
import { reconcileEnergyDays } from "../../domain/services/EnergyDailyReconciliationService.js";
import { composeLoggedTodaySummary } from "../../domain/services/LoggedTodayService.js";

export const HEALTHKIT_GRADUATION_AUDIT_RECORD_PREFIX = "healthkit_graduation_audit_";
const OBSERVATION_COLLECTION = "healthKitObservations";
const EVIDENCE_COLLECTION = "canonicalEvidenceObjects";

/**
 * Bounded, owner-scoped graduation-policy operation. This is the ONLY writer of
 * the graduation policy record. The dry run IS the graduation simulation: it
 * runs the same overlay code the readers run, against the stored canonical days
 * and ordinary evidence, and writes nothing.
 *
 *   set  desired = { projection?, evidenceEligibility? }. A named scope is set
 *        exactly as given; an omitted scope keeps its current value. Turning a
 *        scope OFF ({ enabled: false }) is the prospective rollback: it stops
 *        future use and deletes nothing.
 *
 * Apply needs the `expected` facts of the immediately preceding dry run and an
 * authorization reference, refuses if production drifted, writes exactly the
 * policy record and one audit row, and verifies in the same transaction that
 * canonical days, source observations, ordinary Evidence, the canonicalization
 * policies, and the Workout collections did not change.
 */
export async function runHealthKitGraduationPolicy({
  records,
  authorization,
  desired = {},
  apply = false,
  expected = null,
  includeValues = true,
  now = () => new Date(),
} = {}) {
  const { ownerUserId } = authorization;
  const list = (collection) => records.list({ ownerUserId, collection });
  const getConfiguration = (recordId) => records.get({ ownerUserId, collection: HEALTHKIT_GRADUATION_CONFIGURATION_COLLECTION, recordId });
  const [policyRecord, dailyPolicy, workoutPolicy, observations, canonicalDays, workouts, links, claims, evidence] = await Promise.all([
    getConfiguration(HEALTHKIT_GRADUATION_POLICY_RECORD_ID),
    getConfiguration(HEALTHKIT_CANONICAL_ACTIVATION_POLICY_RECORD_ID),
    getConfiguration(HEALTHKIT_WORKOUT_ACTIVATION_POLICY_RECORD_ID),
    list(OBSERVATION_COLLECTION),
    list(HEALTHKIT_CANONICAL_DAY_COLLECTION),
    list(HEALTHKIT_CANONICAL_WORKOUT_COLLECTION),
    list(HEALTHKIT_WORKOUT_LINK_COLLECTION),
    list(HEALTHKIT_WORKOUT_LINK_CLAIM_COLLECTION),
    list(EVIDENCE_COLLECTION),
  ]);
  const facts = collectFacts({ policyRecord, dailyPolicy, workoutPolicy, observations, canonicalDays, workouts, links, claims, evidence });
  const current = resolveHealthKitGraduationPolicy(policyRecord);

  const planned = planPolicy({ policyRecord, current, desired, authorization });
  if (planned.refusal) return Object.freeze({ outcome: "refused", reasons: [planned.refusal], facts });

  const auditRecordId = `${HEALTHKIT_GRADUATION_AUDIT_RECORD_PREFIX}${digest(authorization.authorizationReference ?? "").slice(0, 12)}_set`;
  const simulation = simulateGraduation({ evidence, canonicalDays, current, candidate: planned.resolved, includeValues });
  const summary = {
    action: "set",
    policy: {
      projection: describeScope(planned.resolved.projection),
      evidenceEligibility: describeScope(planned.resolved.evidenceEligibility),
    },
    changed: planned.changed,
    auditRecordId,
    predictedMutations: [
      { collection: HEALTHKIT_GRADUATION_CONFIGURATION_COLLECTION, recordId: HEALTHKIT_GRADUATION_POLICY_RECORD_ID, operation: policyRecord ? "update" : "create" },
      { collection: HEALTHKIT_GRADUATION_CONFIGURATION_COLLECTION, recordId: auditRecordId, operation: "create" },
    ],
    unchangedByDesign: {
      healthKitObservations: facts.observationCount,
      healthKitCanonicalDays: facts.canonicalDayCount,
      canonicalEvidenceObjects: facts.evidenceCount,
      healthKitCanonicalWorkouts: facts.canonicalWorkoutCount,
      healthKitWorkoutLinks: facts.linkCount,
      canonicalizationPolicy: facts.dailyPolicyDigest ?? "absent",
      workoutPolicy: facts.workoutPolicyDigest ?? "absent",
    },
    historicalBriefingRegeneration: false,
    trainingAndWorkoutChanges: "none",
    simulation,
    facts,
  };
  if (!apply) return Object.freeze({ outcome: "dry_run", ...summary });

  const drift = compareFacts(expected, facts);
  if (drift.length > 0) return Object.freeze({ outcome: "drifted", drift, facts });
  if (!String(authorization.authorizationReference ?? "").trim()) {
    throw Object.assign(new Error("Apply requires an authorization reference."), { code: "AUTHORIZATION_REFERENCE_REQUIRED" });
  }
  if (!planned.changed) return Object.freeze({ outcome: "refused", reasons: ["The requested policy equals the current policy; nothing to apply."], facts });

  const at = now().toISOString();
  const audit = await records.putIfAbsent({
    ownerUserId,
    collection: HEALTHKIT_GRADUATION_CONFIGURATION_COLLECTION,
    recordId: auditRecordId,
    sourceIdentity: auditRecordId,
    payload: {
      id: auditRecordId,
      kind: "healthkit_graduation_audit",
      action: "set",
      at,
      authorizationReference: String(authorization.authorizationReference),
      policyRecordId: HEALTHKIT_GRADUATION_POLICY_RECORD_ID,
      before: { digest: facts.policyDigest, projection: describeScope(current.projection), evidenceEligibility: describeScope(current.evidenceEligibility) },
      after: summary.policy,
      historicalBriefingRegeneration: false,
    },
  });
  if (!audit.created) {
    throw Object.assign(new Error("This authorization reference was already used for this action."), { code: "AUDIT_ROW_EXISTS" });
  }
  const nextPolicy = { ...planned.record, id: HEALTHKIT_GRADUATION_POLICY_RECORD_ID, auditRecordId, updatedAt: at };
  const written = policyRecord
    ? await records.put({
      ownerUserId, collection: HEALTHKIT_GRADUATION_CONFIGURATION_COLLECTION, recordId: HEALTHKIT_GRADUATION_POLICY_RECORD_ID,
      expectedVersion: policyRecord.version, sourceIdentity: HEALTHKIT_GRADUATION_POLICY_RECORD_ID, payload: nextPolicy,
    })
    : (await records.putIfAbsent({
      ownerUserId, collection: HEALTHKIT_GRADUATION_CONFIGURATION_COLLECTION, recordId: HEALTHKIT_GRADUATION_POLICY_RECORD_ID,
      sourceIdentity: HEALTHKIT_GRADUATION_POLICY_RECORD_ID, payload: nextPolicy,
    })).record;

  // In-transaction verification. Any failure throws and the caller rolls back.
  const [afterPolicy, afterDaily, afterWorkoutPolicy, afterObservations, afterDays, afterWorkouts, afterLinks, afterClaims, afterEvidence] = await Promise.all([
    getConfiguration(HEALTHKIT_GRADUATION_POLICY_RECORD_ID),
    getConfiguration(HEALTHKIT_CANONICAL_ACTIVATION_POLICY_RECORD_ID),
    getConfiguration(HEALTHKIT_WORKOUT_ACTIVATION_POLICY_RECORD_ID),
    list(OBSERVATION_COLLECTION),
    list(HEALTHKIT_CANONICAL_DAY_COLLECTION),
    list(HEALTHKIT_CANONICAL_WORKOUT_COLLECTION),
    list(HEALTHKIT_WORKOUT_LINK_COLLECTION),
    list(HEALTHKIT_WORKOUT_LINK_CLAIM_COLLECTION),
    list(EVIDENCE_COLLECTION),
  ]);
  const resolved = resolveHealthKitGraduationPolicy(afterPolicy);
  const invariants = {
    policyIsExactlyTheAuthorizedRecord: resolved.valid &&
      stable(describeScope(resolved.projection)) === stable(summary.policy.projection) &&
      stable(describeScope(resolved.evidenceEligibility)) === stable(summary.policy.evidenceEligibility),
    noHistoricalBriefingRegeneration: afterPolicy?.historicalBriefingRegeneration === false,
    auditRowPresent: audit.record?.id === auditRecordId,
    canonicalizationPolicyUntouched: (afterDaily ? digest(stable(afterDaily)) : null) === facts.dailyPolicyDigest,
    workoutPolicyUntouched: (afterWorkoutPolicy ? digest(stable(afterWorkoutPolicy)) : null) === facts.workoutPolicyDigest,
    observationsUnchanged: afterObservations.length === facts.observationCount && listDigest(afterObservations) === facts.observationsDigest,
    canonicalDaysUnchanged: afterDays.length === facts.canonicalDayCount && listDigest(afterDays) === facts.canonicalDaysDigest,
    canonicalWorkoutsUnchanged: afterWorkouts.length === facts.canonicalWorkoutCount && listDigest(afterWorkouts) === facts.canonicalWorkoutsDigest,
    linksUnchanged: afterLinks.length === facts.linkCount && listDigest(afterLinks) === facts.linksDigest,
    claimsUnchanged: afterClaims.length === facts.claimCount && listDigest(afterClaims) === facts.claimsDigest,
    evidenceUnchanged: afterEvidence.length === facts.evidenceCount && listDigest(afterEvidence) === facts.evidenceDigest,
  };
  if (Object.values(invariants).some((ok) => ok !== true)) {
    throw Object.assign(new Error("Post-write invariants failed."), { code: "POST_WRITE_INVARIANT_FAILED", invariants });
  }
  return Object.freeze({ outcome: "applied", ...summary, invariants, policyVersion: written.version });
}

function planPolicy({ policyRecord, current, desired, authorization }) {
  const scopeOf = (name) => {
    const requested = desired?.[name];
    if (requested === undefined) return current[name].enabled ? describeScope(current[name]) : { enabled: false };
    if (requested === null || requested.enabled === false) return { enabled: false };
    return {
      enabled: true,
      domains: [...new Set(requested.domains ?? [])].sort(),
      startLocalDate: requested.startLocalDate,
      endLocalDate: requested.endLocalDate ?? null,
    };
  };
  const record = {
    schemaVersion: HEALTHKIT_GRADUATION_POLICY_SCHEMA_VERSION,
    projection: scopeOf("projection"),
    evidenceEligibility: scopeOf("evidenceEligibility"),
    // Not a parameter: graduation never regenerates a published briefing.
    historicalBriefingRegeneration: false,
    authorizationReference: String(authorization.authorizationReference ?? ""),
  };
  const resolved = resolveHealthKitGraduationPolicy(record);
  if (!resolved.valid) {
    return { refusal: `The requested graduation policy is not valid (${resolved.invalidReason}): domains must be activity and/or nutrition, with an exact start date and an optional end date on or after it.` };
  }
  const before = stable({ projection: describeScope(current.projection), evidenceEligibility: describeScope(current.evidenceEligibility) });
  const after = stable({ projection: describeScope(resolved.projection), evidenceEligibility: describeScope(resolved.evidenceEligibility) });
  return { record, resolved, changed: before !== after || !policyRecord };
}

const describeScope = (scope) => (scope.enabled
  ? { enabled: true, domains: [...scope.domains], startLocalDate: scope.startLocalDate, endLocalDate: scope.endLocalDate }
  : { enabled: false });

// The graduation dry run. It is the simulation: for every canonical HealthKit
// day the candidate policy would graduate, the same overlay the readers run
// produces the ordinary day, and the predicted Log rows, Energy row, Nutrition
// authority, V3 factual inputs and duplicate handling are read off it.
function simulateGraduation({ evidence, canonicalDays, current, candidate, includeValues }) {
  const purposes = [
    ["projection", HealthKitGraduationPurpose.PROJECTION],
    ["evidenceEligibility", HealthKitGraduationPurpose.EVIDENCE],
  ];
  const result = {};
  for (const [name, purpose] of purposes) {
    const before = overlayGraduatedHealthKitDays({ canonicalObjects: evidence, healthKitDays: canonicalDays, policy: current, purpose });
    const after = overlayGraduatedHealthKitDays({ canonicalObjects: evidence, healthKitDays: canonicalDays, policy: candidate, purpose });
    const beforeKeys = new Set(before.applied.map((entry) => `${entry.domain}|${entry.localDate}`));
    const added = after.applied.filter((entry) => !beforeKeys.has(`${entry.domain}|${entry.localDate}`));
    const removed = before.applied.filter((entry) => !after.applied.some((next) => next.domain === entry.domain && next.localDate === entry.localDate));
    const dates = [...new Set([...added, ...removed].map((entry) => entry.localDate))].sort();
    result[name] = {
      daysGraduated: added.map((entry) => ({ domain: entry.domain, localDate: entry.localDate, mode: entry.mode, coexistence: entry.coexistence?.state ?? null })),
      daysWithdrawn: removed.map((entry) => ({ domain: entry.domain, localDate: entry.localDate })),
      duplicateSuppression: {
        mergedIntoExisting: added.filter((entry) => entry.mode === "merged_into_existing").length,
        existingKept: added.filter((entry) => entry.mode === "existing_kept").length,
        projectedAlone: added.filter((entry) => entry.mode === "projected_alone").length,
      },
      predicted: dates.map((date) => predictDate({ date, objects: after.objects, includeValues })),
    };
  }
  result.v3 = {
    // V3 has no HealthKit-specific switch: it reads ordinary evidence, so its
    // eligible observations change only by the days the evidence scope adds.
    eligibleObservationDaysAdded: result.evidenceEligibility.daysGraduated.length,
    hiddenHealthKitSpecialCase: false,
    confidenceInputs: "no direct change; Confidence follows the existing V3 evidence-quality model on the added ordinary observations",
    historicalBriefingsRegenerated: 0,
    nextEligibleBriefings: "recurring briefings generated after the switch that read windows containing an added day",
  };
  return result;
}

function predictDate({ date, objects, includeValues }) {
  const activity = selectActiveCanonicalActivityDays(objects, { date }).records;
  const nutrition = selectActiveCanonicalNutritionDays(objects, { date }).records;
  const logRows = composeLoggedTodaySummary({ canonicalObjects: objects, dateKey: date }).rows.filter((row) => row.id !== "training");
  const authority = nutrition[0] ? resolveNutritionDayAuthority(nutrition[0].payload ?? nutrition[0]) : null;
  const energy = reconcileEnergyDays({
    activityDays: activity.map((record) => record.payload ?? record),
    nutritionDays: nutrition.map((record) => record.payload ?? record),
    calendarDates: [date],
  }).find((row) => row.date === date) ?? null;
  const shape = (value) => (includeValues ? value : value === null || value === undefined ? null : "present");
  return {
    date,
    activeDays: activity.length,
    nutritionDays: nutrition.length,
    activitySource: activity[0] ? sourceLabel(activity[0]) : null,
    nutritionSource: nutrition[0] ? sourceLabel(nutrition[0]) : null,
    logRows: logRows.map((row) => ({ id: row.id, summary: includeValues ? row.summary : shape(row.summary), context: includeValues ? row.context : shape(row.context) })),
    nutritionAuthority: authority ? {
      tier: authority.assertion.tier, origin: authority.assertion.origin, reliability: authority.reliability,
      energyUsable: authority.energyUsable, energyCompleteness: authority.energyCompleteness,
    } : null,
    energyInputs: energy ? { calorieIntake: shape(energy.calorieIntake), activeCalories: shape(energy.activeCalories) } : null,
  };
}

const sourceLabel = (record) => {
  const source = (record.payload ?? record).source ?? {};
  return [source.application, source.modality].filter(Boolean).join("/") || null;
};

function collectFacts({ policyRecord, dailyPolicy, workoutPolicy, observations, canonicalDays, workouts, links, claims, evidence }) {
  return {
    policyPresent: Boolean(policyRecord),
    policyDigest: policyRecord ? digest(stable(policyRecord)) : null,
    dailyPolicyDigest: dailyPolicy ? digest(stable(dailyPolicy)) : null,
    workoutPolicyDigest: workoutPolicy ? digest(stable(workoutPolicy)) : null,
    observationCount: observations.length,
    observationsDigest: listDigest(observations),
    canonicalDayCount: canonicalDays.length,
    canonicalDaysDigest: listDigest(canonicalDays),
    canonicalWorkoutCount: workouts.length,
    canonicalWorkoutsDigest: listDigest(workouts),
    linkCount: links.length,
    linksDigest: listDigest(links),
    claimCount: claims.length,
    claimsDigest: listDigest(claims),
    evidenceCount: evidence.length,
    evidenceDigest: listDigest(evidence),
  };
}

function compareFacts(expected, actual) {
  if (!expected || typeof expected !== "object") return ["expected facts are required for apply"];
  return Object.keys(actual).filter((key) => JSON.stringify(expected[key] ?? null) !== JSON.stringify(actual[key] ?? null));
}

function listDigest(list) {
  return digest(list.map((record) => `${record.id ?? record.canonicalId}:${record.version ?? 1}:${digest(stable(record))}`).sort().join(","));
}

function digest(value) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 32);
}

function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}
