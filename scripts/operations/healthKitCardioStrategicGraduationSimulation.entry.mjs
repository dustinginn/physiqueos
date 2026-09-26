// Zero-write Phase 1 Cardio strategic-graduation bounded simulation.
//
// Transported into the existing App Platform `web` component by the accepted console runner
// (bundled by buildHealthKitCardioSimulationPayload.mjs). Contract: identity gates before any
// database access, one bounded connection, BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY, SHOW
// transaction_read_only must be `on`, owner-scoped parameterized SELECTs only, explicit ROLLBACK,
// success marker only after a successful rollback. Writes nothing, ever.
//
// This simulates the NOT-YET-DEPLOYED `overlayGraduatedHealthKitCardioWorkouts` candidate (its
// orchestration logic is inlined here since the running container does not have it) against real
// canonical Cardio workouts and real canonicalEvidenceObjects for a bounded window, under a
// hypothetical scope -- the real, currently-deployed graduation policy is also read and reported
// unmodified to prove nothing live has changed.
import { createRequire } from "node:module";
import { createPhase4CanonicalRecordStore } from "../../src/platform/database/Phase4CanonicalRecordStore.js";
import {
  HealthKitGraduationPurpose,
  HEALTHKIT_GRADUATION_POLICY_RECORD_ID,
  HEALTHKIT_GRADUATION_CONFIGURATION_COLLECTION,
  HEALTHKIT_GRADUATION_PROJECTION_VERSION,
  resolveHealthKitGraduationPolicy,
  isHealthKitGraduationInScope,
} from "../../src/domain/services/HealthKitGraduation.js";
import { HealthKitWorkoutFamily } from "../../src/domain/services/HealthKitWorkoutService.js";
import { projectPresentedHealthKitCardioTrainingRecords } from "../../src/domain/services/HealthKitCardioTrainingPresentation.js";
import { isPresentableCanonicalCardioWorkout } from "../../src/domain/services/HealthKitWorkoutPresentationService.js";
import { HEALTHKIT_CANONICAL_WORKOUT_COLLECTION_NAME, isHealthKitDerivedRecord } from "../../src/domain/services/HealthKitEvidenceEligibilityPolicy.js";
import { resolveLocalTimeZone } from "../../src/domain/utils/localDate.js";

const EXPECTED_GIT_SHA = typeof __EXPECTED_GIT_SHA__ === "undefined" ? "" : __EXPECTED_GIT_SHA__;
const START = typeof __START__ === "undefined" ? "" : __START__;
const END = typeof __END__ === "undefined" ? "" : __END__;
const TIME_ZONE = typeof __TIME_ZONE__ === "undefined" ? "America/Chicago" : __TIME_ZONE__;
const MARKER = typeof __MARKER__ === "undefined" ? "PHYSIQUEOS_HEALTHKIT_CARDIO_SIMULATION_SUCCESS" : __MARKER__;
const OWNER = "user_founder_001";
const REQUIRE_ROOT = "/app/server.js";
const SSL_URL_PARAMETERS = Object.freeze(["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert", "sslnegotiation", "uselibpqcompat"]);
const watchdog = setTimeout(() => stop("SIMULATION_TIMEOUT", 3), 150_000);

function stop(code, status = 1) {
  process.stdout.write(`PHYSIQUEOS_HEALTHKIT_CARDIO_SIMULATION_FAILED:${code}\n`);
  process.exit(status);
}
const sanitizedCode = (error) => (/^[A-Za-z0-9_]{3,40}$/.test(String(error?.code ?? "")) ? String(error.code) : "SIMULATION_ERROR");

// Local re-implementation of the candidate's eligibility stamp (the private helper of the
// same name in HealthKitGraduation.js is not exported); identical to that file's own body.
function eligibilityOf(purpose) {
  return purpose === HealthKitGraduationPurpose.EVIDENCE
    ? { state: "eligible", strategic: true, decidedBy: HEALTHKIT_GRADUATION_PROJECTION_VERSION }
    : { state: "quarantined", strategic: false, decidedBy: HEALTHKIT_GRADUATION_PROJECTION_VERSION };
}

// The candidate function itself, copied verbatim in shape from
// src/domain/services/HealthKitGraduation.js on branch codex/healthkit-cardio-strategic-graduation
// (uncommitted, not yet deployed) -- run here against REAL data as a pure, in-memory simulation.
function overlayGraduatedHealthKitCardioWorkouts({ canonicalObjects = [], canonicalWorkouts = [], policy = null, purpose = HealthKitGraduationPurpose.PROJECTION, timeZone = null } = {}) {
  const resolved = policy?.projection ? policy : resolveHealthKitGraduationPolicy(policy);
  const scope = purpose === HealthKitGraduationPurpose.EVIDENCE ? resolved.evidenceEligibility : resolved.projection;
  if (!scope.enabled || !scope.domains.includes("cardio_training") || canonicalWorkouts.length === 0) {
    return Object.freeze({ objects: canonicalObjects, applied: Object.freeze([]) });
  }
  const eligible = canonicalWorkouts.filter((workout) => {
    if (workout?.current?.family !== HealthKitWorkoutFamily.CARDIO) return false;
    const localDate = workout.localDate ?? workout.current?.localDate ?? null;
    return isHealthKitGraduationInScope(scope, { domain: "cardio_training", localDate });
  });
  if (eligible.length === 0) return Object.freeze({ objects: canonicalObjects, applied: Object.freeze([]) });
  const projected = projectPresentedHealthKitCardioTrainingRecords({ canonicalWorkouts: eligible, existingEvidenceObjects: canonicalObjects, timeZone: resolveLocalTimeZone(timeZone) });
  if (projected.length === 0) return Object.freeze({ objects: canonicalObjects, applied: Object.freeze([]) });
  const graduated = projected.map((record) => Object.freeze({
    ...record,
    payload: Object.freeze({ ...record.payload, evidenceEligibility: eligibilityOf(purpose) }),
    healthKitProjection: Object.freeze({ version: HEALTHKIT_GRADUATION_PROJECTION_VERSION, purpose, mode: "projected_alone", healthKitCanonicalWorkoutId: record.id, readOnly: true }),
  }));
  return Object.freeze({
    objects: [...canonicalObjects, ...graduated],
    applied: Object.freeze(graduated.map((record) => ({ domain: "cardio_training", localDate: record.payload.observed_at, mode: "projected_alone", coexistence: null }))),
  });
}

if (!/^\d{4}-\d{2}-\d{2}$/.test(START) || !/^\d{4}-\d{2}-\d{2}$/.test(END) || START > END) stop("WINDOW_INVALID");
if (!/^[0-9a-f]{40}$/.test(EXPECTED_GIT_SHA)) stop("EXPECTED_GIT_SHA_REQUIRED");
if (String(process.env.PHYSIQUEOS_GIT_SHA ?? "") !== EXPECTED_GIT_SHA) stop("RUNTIME_SHA_MISMATCH");
if (process.env.PHYSIQUEOS_CANONICAL_OWNER_USER_ID !== OWNER) stop("OWNER_MISMATCH");
const rawUrl = String(process.env.PHYSIQUEOS_DATABASE_URL ?? "").trim();
const certificate = String(process.env.PHYSIQUEOS_DATABASE_CA_CERT ?? "").trim();
if (!rawUrl) stop("DATABASE_BINDING_MISSING");
if (!certificate.includes("-----BEGIN CERTIFICATE-----")) stop("DATABASE_CA_MISSING");
let pg;
try { pg = createRequire(REQUIRE_ROOT)("pg"); } catch { stop("PG_UNAVAILABLE"); }
let connectionString;
try {
  const url = new URL(rawUrl);
  for (const key of SSL_URL_PARAMETERS) url.searchParams.delete(key);
  connectionString = url.toString();
} catch { stop("DATABASE_BINDING_INVALID"); }

const pool = new pg.Pool({
  connectionString,
  ssl: { ca: certificate, rejectUnauthorized: true },
  max: 1,
  application_name: "physiqueos-healthkit-cardio-simulation",
  statement_timeout: 30_000,
  idle_in_transaction_session_timeout: 60_000,
  connectionTimeoutMillis: 8_000,
});
pool.on("error", () => {});

let client;
let open = false;
let failure = null;
let report = null;
try {
  client = await pool.connect();
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  open = true;
  const readOnly = (await client.query("SHOW transaction_read_only")).rows[0]?.transaction_read_only;
  if (readOnly !== "on") throw Object.assign(new Error("read-only fence"), { code: "TRANSACTION_NOT_READ_ONLY" });
  const records = createPhase4CanonicalRecordStore({ query: (text, values) => client.query(text, values) });
  // Sequential, not Promise.all: a single pg Client cannot pipeline concurrent
  // queries without a deprecation warning on stderr, and the transport wrapper
  // refuses any unexpected stderr output.
  const livePolicyRecord = await records.get({ ownerUserId: OWNER, collection: HEALTHKIT_GRADUATION_CONFIGURATION_COLLECTION, recordId: HEALTHKIT_GRADUATION_POLICY_RECORD_ID });
  const canonicalWorkouts = await records.list({ ownerUserId: OWNER, collection: HEALTHKIT_CANONICAL_WORKOUT_COLLECTION_NAME });
  const canonicalEvidenceObjects = await records.list({ ownerUserId: OWNER, collection: "canonicalEvidenceObjects" });
  await client.query("ROLLBACK");
  open = false;

  const liveResolved = resolveHealthKitGraduationPolicy(livePolicyRecord);
  const inWindow = (localDate) => typeof localDate === "string" && localDate >= START && localDate <= END;
  const windowWorkouts = canonicalWorkouts.filter((workout) => inWindow(workout.localDate ?? workout.current?.localDate));
  const cardioWorkouts = windowWorkouts.filter((workout) => workout.current?.family === HealthKitWorkoutFamily.CARDIO);
  const strengthWorkouts = windowWorkouts.filter((workout) => workout.current?.family === HealthKitWorkoutFamily.STRENGTH);
  const activityDayObjectsBefore = canonicalEvidenceObjects.filter((object) => (object.payload?.evidence_type ?? object.evidence_type) === "activity_day");
  const trainingObjectsBefore = canonicalEvidenceObjects.filter((object) => (object.payload?.evidence_type ?? object.evidence_type) === "training");
  const preExistingIds = new Set(canonicalEvidenceObjects.map((object) => object.canonicalId ?? object.id ?? object.payload?.id));

  // Hypothetical scope: EVIDENCE purpose, cardio_training domain, exactly this bounded window.
  const hypotheticalPolicy = resolveHealthKitGraduationPolicy({
    schemaVersion: liveResolved.schemaVersion, id: HEALTHKIT_GRADUATION_POLICY_RECORD_ID,
    projection: { enabled: false },
    evidenceEligibility: { enabled: true, domains: ["cardio_training"], startLocalDate: START, endLocalDate: END },
    historicalBriefingRegeneration: false,
  });

  const { objects: afterEvidence, applied: appliedEvidence } = overlayGraduatedHealthKitCardioWorkouts({
    canonicalObjects: canonicalEvidenceObjects, canonicalWorkouts: windowWorkouts, policy: hypotheticalPolicy, purpose: HealthKitGraduationPurpose.EVIDENCE, timeZone: TIME_ZONE,
  });
  const { objects: afterProjectionOnly } = overlayGraduatedHealthKitCardioWorkouts({
    canonicalObjects: canonicalEvidenceObjects, canonicalWorkouts: windowWorkouts,
    policy: resolveHealthKitGraduationPolicy({ schemaVersion: liveResolved.schemaVersion, id: HEALTHKIT_GRADUATION_POLICY_RECORD_ID, projection: { enabled: true, domains: ["cardio_training"], startLocalDate: START, endLocalDate: END }, evidenceEligibility: { enabled: false }, historicalBriefingRegeneration: false }),
    purpose: HealthKitGraduationPurpose.PROJECTION, timeZone: TIME_ZONE,
  });

  const graduatedEvidenceObjects = afterEvidence.filter((object) => !preExistingIds.has(object.canonicalId ?? object.id ?? object.payload?.id));
  const graduatedFromStrength = graduatedEvidenceObjects.filter((object) => object.healthKitProjection?.healthKitCanonicalWorkoutId && strengthWorkouts.some((workout) => workout.id === object.healthKitProjection.healthKitCanonicalWorkoutId));
  const unchangedExistingObjects = afterEvidence.slice(0, canonicalEvidenceObjects.length).every((object, index) => object === canonicalEvidenceObjects[index]);
  const activityDayObjectsAfter = afterEvidence.filter((object) => (object.payload?.evidence_type ?? object.evidence_type) === "activity_day");
  const activityDayUnchanged = activityDayObjectsAfter.length === activityDayObjectsBefore.length &&
    activityDayObjectsAfter.every((object, index) => JSON.stringify(object) === JSON.stringify(activityDayObjectsBefore[index]));
  const allGraduatedAreHealthKitDerived = graduatedEvidenceObjects.every((object) => isHealthKitDerivedRecord(object));
  const projectionPurposeQuarantined = afterProjectionOnly
    .filter((object) => !preExistingIds.has(object.canonicalId ?? object.id ?? object.payload?.id))
    .every((object) => object.payload?.evidenceEligibility?.state === "quarantined" && object.payload?.evidenceEligibility?.strategic === false);

  report = {
    runtime: { gitSha: String(process.env.PHYSIQUEOS_GIT_SHA), buildId: String(process.env.PHYSIQUEOS_BUILD_ID ?? "") },
    window: { start: START, end: END },
    liveProductionPolicy: {
      // The REAL, currently-deployed policy -- proves nothing live is enabled yet (property d).
      evidenceEligibilityEnabled: liveResolved.evidenceEligibility.enabled,
      evidenceEligibilityDomains: liveResolved.evidenceEligibility.domains,
      projectionEnabled: liveResolved.projection.enabled,
    },
    realDataCounts: {
      totalCanonicalWorkoutsInWindow: windowWorkouts.length,
      cardioWorkoutsInWindow: cardioWorkouts.length,
      strengthWorkoutsInWindow: strengthWorkouts.length,
      canonicalEvidenceObjectsTotal: canonicalEvidenceObjects.length,
      activityDayObjectsBefore: activityDayObjectsBefore.length,
      trainingObjectsBefore: trainingObjectsBefore.length,
    },
    cardioWorkoutCoexistenceBreakdown: cardioWorkouts.reduce((counts, workout) => {
      const state = workout.coexistence?.state ?? "unknown";
      counts[state] = (counts[state] ?? 0) + 1;
      return counts;
    }, {}),
    cardioWorkoutDiagnostics: cardioWorkouts.map((workout) => ({
      id: workout.id, localDate: workout.localDate ?? workout.current?.localDate,
      coexistenceState: workout.coexistence?.state ?? "unknown",
      isPresentable: isPresentableCanonicalCardioWorkout(workout),
      canonicalType: workout.current?.canonicalType ?? null,
      schemaVersion: workout.schemaVersion, revision: workout.revision,
      evidenceEligibilityState: workout.evidenceEligibility?.state ?? null,
    })),
    hypotheticalSimulation: {
      appliedCount: appliedEvidence.length,
      graduatedEvidenceObjectCount: graduatedEvidenceObjects.length,
      graduatedFromStrengthCount: graduatedFromStrength.length, // must be 0 -- Strength never graduates
      unchangedExistingObjects, // must be true -- pre-existing objects are untouched by reference
      activityDayUnchanged, // must be true -- no double counting into activity_day
      allGraduatedAreHealthKitDerived, // must be true -- provenance lineage preserved
      projectionPurposeQuarantined, // must be true -- projection purpose never marks eligible
    },
  };
} catch (error) {
  failure = sanitizedCode(error);
} finally {
  if (open && client) { try { await client.query("ROLLBACK"); } catch { failure ??= "ROLLBACK_FAILED"; } }
  try { client?.release(); } catch { failure ??= "RELEASE_FAILED"; }
  try { await pool.end(); } catch { failure ??= "POOL_CLOSE_FAILED"; }
  clearTimeout(watchdog);
}
if (failure || !report) stop(failure ?? "SIMULATION_INCOMPLETE");
process.stdout.write(`PHYSIQUEOS_HEALTHKIT_CARDIO_SIMULATION_JSON:${JSON.stringify(report)}\n`);
process.stdout.write(`${MARKER}\n`);
