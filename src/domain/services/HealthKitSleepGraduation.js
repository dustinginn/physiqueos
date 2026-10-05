import { HEALTHKIT_SLEEP_DAY_ID_PREFIX } from "./HealthKitSleepContract.js";
import {
  HEALTHKIT_SLEEP_STRATEGIC_POLICY_SCHEMA_VERSION,
  assessHealthKitSleepStrategicEligibility,
} from "./HealthKitSleepStrategicEligibility.js";

// Prospective graduation of canonical HealthKit Sleep into V3 evidence.
//
//   HealthKit Sleep sample (healthKitSleepSamples, unchanged, quarantined)
//     -> canonical sleep day (healthKitSleepDays, unchanged, quarantined)
//     -> THIS eligibility decision + READ-TIME projection
//     -> one `sleep_night` evidence object per completed night, in the array a
//        V3 briefing generator is about to consume, and nowhere else.
//
// Nothing here writes. The projected object carries HealthKit Sleep lineage, so
// the strategic write guard still refuses to persist it, and turning the scope
// off stops future use without deleting anything. Published briefings, Goal
// Confidence, Strategy, recommendations and historical Sleep are never touched.
//
// A night is strategic evidence only when ALL of these hold:
//   * the Server-owned graduation policy's `evidenceEligibility` scope names
//     `sleep` and covers the night's sleep day;
//   * the Sleep activation policy is enabled and the night is on/after its
//     Founder-approved D0 (`effectiveSleepDay`) — the boundary is read from
//     current authority, never inferred or widened;
//   * it is an ordinary prospective day (historical import is permanently
//     display-only) computed by a stage-trustworthy algorithm (v2/v3);
//   * a main sleep episode was recorded from a sensor source (manual Health
//     entries stay display-only);
//   * the night's 18:00 sleep-day window has CLOSED at the generator's `asOf`,
//     so a still-updating (current) night can never become evidence early.
// Missing stage detail never disqualifies a trustworthy total; stage values are
// carried only when the canonical day says they are staged and they add up.

export const HEALTHKIT_SLEEP_NIGHT_EVIDENCE_TYPE = "sleep_night";
export const HEALTHKIT_SLEEP_NIGHT_EVIDENCE_SCHEMA_VERSION = "healthkit-sleep-strategic-night-v1";
export const HEALTHKIT_SLEEP_GRADUATION_DOMAIN = "sleep";
const STRATEGIC_ALGORITHMS = Object.freeze(["sleep-canon-v2", "sleep-canon-v3"]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The Sleep strategic policy implied by current authority: ON only when the
 * graduation policy's evidence scope names `sleep` AND Sleep ingestion is
 * enabled; the effective boundary is the later of the scope start and the
 * Founder-approved Sleep D0. Fail-closed and never throwing.
 */
export function resolveHealthKitSleepStrategicPolicy({ graduationPolicy = null, activationPolicy = null } = {}) {
  const off = (reason) => Object.freeze({
    schemaVersion: HEALTHKIT_SLEEP_STRATEGIC_POLICY_SCHEMA_VERSION, enabled: false, strategicEffectiveAt: null, endSleepDay: null, reason,
  });
  const scope = graduationPolicy?.evidenceEligibility;
  if (!scope?.enabled || !Array.isArray(scope.domains) || !scope.domains.includes(HEALTHKIT_SLEEP_GRADUATION_DOMAIN)) {
    return off("sleep_not_in_evidence_scope");
  }
  if (activationPolicy?.enabled !== true || !DATE.test(String(activationPolicy.effectiveSleepDay ?? ""))) {
    return off("sleep_ingestion_not_enabled");
  }
  if (!DATE.test(String(scope.startLocalDate ?? ""))) return off("evidence_scope_invalid");
  const strategicEffectiveAt = [scope.startLocalDate, activationPolicy.effectiveSleepDay].sort().at(-1);
  return Object.freeze({
    schemaVersion: HEALTHKIT_SLEEP_STRATEGIC_POLICY_SCHEMA_VERSION,
    enabled: true,
    strategicEffectiveAt,
    endSleepDay: scope.endLocalDate ?? null,
    reason: "sleep_in_evidence_scope",
  });
}

/** The single per-night decision. `asOf` is the generator's own clock. */
export function assessHealthKitSleepNightEvidence(day, { strategicPolicy = null, asOf = null } = {}) {
  const refuse = (reason) => Object.freeze({ eligible: false, reason });
  if (!day || typeof day !== "object") return refuse("not_a_sleep_day");
  if (!String(day.id ?? "").startsWith(HEALTHKIT_SLEEP_DAY_ID_PREFIX) || !DATE.test(String(day.sleepDay ?? ""))) {
    return refuse("not_an_ordinary_sleep_day");
  }
  const seam = assessHealthKitSleepStrategicEligibility(day, strategicPolicy);
  if (!seam.eligible) return refuse(seam.reason);
  if (!STRATEGIC_ALGORITHMS.includes(day.algorithmVersion)) return refuse("algorithm_not_strategic");
  const main = mainEpisodeOf(day);
  const asleep = day.mainSleep?.asleepSeconds;
  if (day.status !== "asleep_recorded" || !main || !Number.isFinite(asleep) || asleep <= 0) return refuse("no_main_sleep");
  const closesAt = Date.parse(String(day.windowClosesAt ?? ""));
  const now = asOf instanceof Date ? asOf.getTime() : Date.parse(String(asOf ?? ""));
  if (!Number.isFinite(closesAt) || !Number.isFinite(now)) return refuse("sleep_day_window_unknown");
  if (now < closesAt) return refuse("sleep_day_window_open");
  if (main.completeness?.sourceBasis !== "sensor") return refuse("manual_only_not_strategic");
  const values = day.mainSleep ?? {};
  if (Object.values(values).some((value) => typeof value === "number" && (!Number.isFinite(value) || value < 0))) {
    return refuse("invalid_durations");
  }
  return Object.freeze({ eligible: true, reason: "completed_sensor_night_in_strategic_scope" });
}

/** One plain evidence object for an eligible canonical night (read-time only). */
export function projectHealthKitSleepNightEvidence(day, { ownerUserId = null } = {}) {
  const main = mainEpisodeOf(day);
  const values = day.mainSleep;
  const staged = main.completeness?.stageDetail === "staged";
  const stageSum = (values.coreSeconds ?? 0) + (values.deepSeconds ?? 0) + (values.remSeconds ?? 0) + (values.unspecifiedSeconds ?? 0);
  const stagesCoherent = staged && stageSum === values.asleepSeconds;
  const stageDetail = !staged ? "stage_detail_absent" : stagesCoherent ? "staged" : "withheld_incoherent";
  const revision = Number(day.revision ?? 1);
  const payload = Object.freeze({
    id: day.id,
    schemaVersion: HEALTHKIT_SLEEP_NIGHT_EVIDENCE_SCHEMA_VERSION,
    evidence_type: HEALTHKIT_SLEEP_NIGHT_EVIDENCE_TYPE,
    // The night is named by its wake date (the canonical sleep day).
    observed_at: day.sleepDay,
    sleep_day: day.sleepDay,
    main_sleep: Object.freeze({
      asleep_seconds: values.asleepSeconds,
      awake_seconds: Number.isFinite(values.awakeSeconds) ? values.awakeSeconds : null,
      in_bed_seconds: Number.isFinite(values.inBedSeconds) ? values.inBedSeconds : null,
      stage_detail: stageDetail,
      stages: stageDetail === "staged" ? Object.freeze({
        core_seconds: values.coreSeconds, deep_seconds: values.deepSeconds,
        rem_seconds: values.remSeconds, unspecified_seconds: values.unspecifiedSeconds,
      }) : null,
      window_start: main.start,
      window_end: main.end,
      time_zone: main.timeZone ?? day.timeZone ?? null,
    }),
    time_zone_shift: day.timeZoneShift === true,
    source: Object.freeze({
      application: "Apple Health", integration: "HealthKit", modality: "direct",
      source_family: main.primarySource?.sourceFamily ?? null,
    }),
    canonical: Object.freeze({
      sleep_day_id: day.id,
      revision,
      algorithm_version: day.algorithmVersion,
      input_digest: day.inputDigest ?? null,
      ingestion_purpose: day.ingestionPurpose,
    }),
    evidenceEligibility: Object.freeze({ state: "eligible", strategic: true, decidedBy: HEALTHKIT_SLEEP_NIGHT_EVIDENCE_SCHEMA_VERSION }),
  });
  return Object.freeze({
    id: day.id,
    canonicalId: day.id,
    evidence_type: HEALTHKIT_SLEEP_NIGHT_EVIDENCE_TYPE,
    createdAt: day.computedAt ?? day.windowClosesAt,
    updatedAt: day.computedAt ?? day.windowClosesAt,
    // Deliberately no first/lastObservedAt: legacy (V2/PI) readers select
    // "everything observed in the window" by those wrapper fields, type-blind.
    // A night is dated only by `payload.sleep_day`, which the V3 Recovery slot
    // reads; every legacy artifact stays byte-identical.
    quality: Object.freeze({ status: "active" }),
    userId: day.userId ?? ownerUserId ?? null,
    provenance: Object.freeze({
      source_observation_ids: [],
      source_artifact_refs: [],
      healthkit_sleep_day_id: day.id,
      healthkit_sleep_day_revision: revision,
      application: "Apple Health",
      integration: "HealthKit",
      modality: "direct",
    }),
    payload,
    healthKitProjection: Object.freeze({
      version: HEALTHKIT_SLEEP_NIGHT_EVIDENCE_SCHEMA_VERSION,
      purpose: "evidence",
      mode: "projected_alone",
      healthKitSleepDayId: day.id,
      revision,
      readOnly: true,
    }),
  });
}

/**
 * Appends one `sleep_night` object per eligible completed night. Exactly one
 * per sleep day (a replayed or duplicated row never doubles a night), never one
 * already present in `canonicalObjects`. With Sleep out of scope it returns the
 * SAME array untouched.
 */
export function overlayGraduatedHealthKitSleepNights({
  canonicalObjects = [],
  sleepDays = [],
  graduationPolicy = null,
  activationPolicy = null,
  asOf = null,
  ownerUserId = null,
} = {}) {
  const strategicPolicy = resolveHealthKitSleepStrategicPolicy({ graduationPolicy, activationPolicy });
  const unchanged = (decisions = []) => Object.freeze({ objects: canonicalObjects, applied: Object.freeze([]), decisions: Object.freeze(decisions), strategicPolicy });
  if (!strategicPolicy.enabled || sleepDays.length === 0) return unchanged();
  const present = new Set(canonicalObjects.map((item) => item?.canonicalId ?? item?.id).filter(Boolean));
  const byDay = new Map();
  for (const day of sleepDays) {
    if (!day?.sleepDay) continue;
    const previous = byDay.get(day.sleepDay);
    if (!previous || Number(day.revision ?? 0) > Number(previous.revision ?? 0)) byDay.set(day.sleepDay, day);
  }
  const decisions = [];
  const projected = [];
  for (const day of [...byDay.values()].sort((left, right) => left.sleepDay.localeCompare(right.sleepDay))) {
    const decision = assessHealthKitSleepNightEvidence(day, { strategicPolicy, asOf });
    decisions.push(Object.freeze({ sleepDay: day.sleepDay, revision: Number(day.revision ?? 1), ...decision }));
    if (!decision.eligible || present.has(day.id)) continue;
    projected.push(projectHealthKitSleepNightEvidence(day, { ownerUserId }));
  }
  if (projected.length === 0) return unchanged(decisions);
  return Object.freeze({
    objects: [...canonicalObjects, ...projected],
    applied: Object.freeze(projected.map((item) => Object.freeze({ domain: HEALTHKIT_SLEEP_GRADUATION_DOMAIN, localDate: item.payload.sleep_day, revision: item.payload.canonical.revision }))),
    decisions: Object.freeze(decisions),
    strategicPolicy,
  });
}

function mainEpisodeOf(day) {
  const episodes = Array.isArray(day?.episodes) ? day.episodes : [];
  return episodes[day?.mainEpisodeIndex] ?? episodes.find((episode) => episode?.kind === "main") ?? null;
}
