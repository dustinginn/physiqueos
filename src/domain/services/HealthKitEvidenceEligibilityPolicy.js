// Strategic Evidence eligibility boundary for HealthKit-derived records.
//
//   HealthKit source observation
//     -> canonical PhysiqueOS Activity/Nutrition day (healthKitCanonicalDays)
//     -> THIS separate eligibility gate
//     -> V3 / Confidence / briefings, only after explicit Founder authorization.
//
// Canonicalization and eligibility are different decisions. A HealthKit
// canonical day is a real PhysiqueOS record, but transport provenance never
// decides strategic meaning. During the proving period the answer is a
// hard-coded, fail-closed "quarantined" for every HealthKit-derived record:
//
//   - there is no configuration switch, policy field, or record value that can
//     make a HealthKit record eligible (the activation policy carries no
//     eligibility control; a stored value other than "quarantined" is ignored);
//   - HealthKit canonical days live in their own application-only collection,
//     so no Evidence, Training, Energy, Confidence, or briefing reader loads
//     them, and the strategic Evidence collection refuses them (below);
//   - promotion into Evidence is a later, separately authorized act, never a
//     stored-record flag. It is the Server-owned graduation policy
//     (HealthKitGraduation.js): a READ-TIME overlay that hands a complete
//     canonical day to ordinary readers as an ordinary activity_day / nutrition
//     object when its evidence-eligibility scope is on. Stored HealthKit
//     records stay quarantined, the write guard below still refuses them, and
//     turning the scope off stops future use without deleting anything.

export const HEALTHKIT_STRATEGIC_EVIDENCE_POLICY_VERSION = "healthkit-strategic-evidence-quarantine-v1";
export const HEALTHKIT_QUARANTINE_STATE = "quarantined";
export const HEALTHKIT_CANONICAL_DAY_COLLECTION = "healthKitCanonicalDays";
export const HEALTHKIT_OBSERVATION_COLLECTION = "healthKitObservations";
export const HEALTHKIT_OBSERVATION_ID_PREFIX = "healthkit_observation_";
export const HEALTHKIT_CANONICAL_DAY_ID_PREFIX = "healthkit_canonical_day_";
export const HEALTHKIT_CANONICAL_WORKOUT_COLLECTION_NAME = "healthKitCanonicalWorkouts";
export const HEALTHKIT_WORKOUT_LINK_COLLECTION_NAME = "healthKitWorkoutLinks";
export const HEALTHKIT_WORKOUT_RECORD_ID_PREFIXES = Object.freeze(["healthkit_canonical_workout_", "healthkit_workout_link_", "healthkit_link_claim_"]);

/**
 * Whether any HealthKit-derived record may currently be strategic Evidence.
 * This is a constant on purpose: flipping it is a reviewed code change made in
 * the later, Founder-authorized promotion task, never a runtime setting.
 */
export const HEALTHKIT_STRATEGIC_EVIDENCE_ELIGIBLE = false; // stored records only; see the graduation overlay above

export class HealthKitEvidenceQuarantineError extends Error {
  constructor(message) {
    super(message);
    this.name = "HealthKitEvidenceQuarantineError";
    this.code = "HEALTHKIT_STRATEGIC_EVIDENCE_QUARANTINED";
  }
}

export function createHealthKitQuarantinedEligibility() {
  return Object.freeze({
    state: HEALTHKIT_QUARANTINE_STATE,
    strategic: false,
    decidedBy: HEALTHKIT_STRATEGIC_EVIDENCE_POLICY_VERSION,
  });
}

/**
 * True when a record (canonical Evidence object, payload, or source
 * observation) descends from HealthKit. Detection is by structural provenance,
 * never by a display name, and looks at every place a HealthKit origin is
 * written: source.integration, the HealthKit observation id prefix, the
 * provenance observation ids, and the quarantine marker itself.
 */
export function isHealthKitDerivedRecord(record) {
  const payload = record?.payload ?? record;
  if (!payload || typeof payload !== "object") return false;
  const source = payload.source ?? record?.source ?? {};
  if (/healthkit/i.test(String(source.integration ?? ""))) return true;
  // An Apple Health source delivered directly (not a screenshot or manual
  // entry) is HealthKit, whether or not the caller named the integration.
  if (/apple health/i.test(String(source.application ?? "")) &&
    /^(direct|api|device|integration|wearable)$/i.test(String(source.modality ?? ""))) return true;
  const ownId = String(payload.id ?? record?.id ?? "");
  if (ownId.startsWith(HEALTHKIT_OBSERVATION_ID_PREFIX) || ownId.startsWith(HEALTHKIT_CANONICAL_DAY_ID_PREFIX)) return true;
  if (HEALTHKIT_WORKOUT_RECORD_ID_PREFIXES.some((prefix) => ownId.startsWith(prefix))) return true;
  if (payload.observationType && payload.ingestion?.deliveryDeviceId !== undefined &&
    String(payload.schemaVersion ?? "").startsWith("healthkit-")) return true;
  if (typeof source.source_observation_id === "string" &&
    source.source_observation_id.startsWith(HEALTHKIT_OBSERVATION_ID_PREFIX)) return true;
  const provenance = payload.provenance ?? record?.provenance ?? {};
  const observationIds = [
    ...(Array.isArray(provenance.source_observation_ids) ? provenance.source_observation_ids : []),
    ...(Array.isArray(provenance.sourceObservationIds) ? provenance.sourceObservationIds : []),
  ];
  if (observationIds.some((id) => String(id).startsWith(HEALTHKIT_OBSERVATION_ID_PREFIX))) return true;
  return payload.evidenceEligibility?.state === HEALTHKIT_QUARANTINE_STATE;
}

/**
 * The single strategic-eligibility decision for HealthKit-derived records.
 * Non-HealthKit records are not this gate's concern and are reported as
 * `not_applicable` so existing Evidence keeps behaving exactly as before.
 */
export function assessHealthKitStrategicEvidenceEligibility(record) {
  if (!isHealthKitDerivedRecord(record)) {
    return Object.freeze({ applicable: false, eligible: null, state: "not_applicable" });
  }
  return Object.freeze({
    applicable: true,
    eligible: HEALTHKIT_STRATEGIC_EVIDENCE_ELIGIBLE === true,
    state: HEALTHKIT_STRATEGIC_EVIDENCE_ELIGIBLE === true ? "eligible" : HEALTHKIT_QUARANTINE_STATE,
    policy: HEALTHKIT_STRATEGIC_EVIDENCE_POLICY_VERSION,
    reason: "healthkit_proving_period_quarantine",
  });
}

/** Records the V3 / Confidence / briefing readers may consume. */
export function selectStrategicallyEligibleRecords(records = []) {
  return records.filter((record) => {
    const assessment = assessHealthKitStrategicEvidenceEligibility(record);
    return !assessment.applicable || assessment.eligible === true;
  });
}

/**
 * Hard guard for any code path that writes the strategic Evidence collection.
 * HealthKit-derived records are refused there while quarantined.
 */
export function assertNotQuarantinedHealthKitEvidence(record, { context = "canonical Evidence write" } = {}) {
  const assessment = assessHealthKitStrategicEvidenceEligibility(record);
  if (assessment.applicable && assessment.eligible !== true) {
    throw new HealthKitEvidenceQuarantineError(
      `HealthKit-derived records are quarantined from strategic Evidence (${context}).`
    );
  }
  return record;
}
