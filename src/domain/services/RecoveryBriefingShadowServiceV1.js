import {
  createRecoveryBriefingAssessmentV1,
  validateRecoveryBriefingAssessmentV1,
} from "./RecoveryBriefingAssessmentServiceV1.js";
import {
  RECOVERY_BRIEFING_SHADOW_RESULT_VERSION,
  RECOVERY_SHADOW_INPUT_AUTHORITY_VERSION,
  RecoveryAssessmentMode,
  RecoveryShadowInputMode,
} from "./RecoveryBriefingPolicyV1.js";
import { projectRecoverySleepInputsV1 } from "./RecoveryBriefingSleepInputProjectionV1.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_PURPOSE_BY_MODE = Object.freeze({
  [RecoveryShadowInputMode.SYNTHETIC]: "synthetic_shadow_fixture",
});

// Storage-free and persistence-free by construction. A composition root
// may call this only after supplying an explicit Server-owned non-strategic
// input authority. No such authority is installed or wired by this task.
export function runRecoveryBriefingShadowV1({ inputAuthority, assessmentInput } = {}) {
  const authority = resolveRecoveryShadowInputAuthorityV1(inputAuthority);
  if (!authority.enabled) return blocked(authority.invalidReason);
  // Prospective validation-only input is ONLY canonical sleep-canon-v3 days,
  // through the fail-closed Recovery projection (per-night ledger, prospective
  // floor, as-of-cutoff revisions). Synthetic fixtures keep the reviewed
  // fixture selection below and can never be mixed with real canonical days.
  const prospective = authority.mode === RecoveryShadowInputMode.PROSPECTIVE_VALIDATION_ONLY;
  if (prospective && assessmentInput?.sleepRecords !== undefined) {
    return blocked("validation_only_requires_canonical_sleep_days");
  }
  if (!prospective && assessmentInput?.sleepDays !== undefined) {
    return blocked("synthetic_mode_refuses_canonical_sleep_days");
  }
  const projection = prospective ? projectRecoverySleepInputsV1({
    sleepDays: assessmentInput?.sleepDays ?? [],
    activationPolicyRecord: assessmentInput?.activationPolicyRecord ?? null,
    algorithmPolicyRecord: assessmentInput?.algorithmPolicyRecord ?? null,
    recoveryEffectiveSleepDay: authority.effectiveSleepDay,
    period: assessmentInput?.period ?? null,
    evidenceCutoff: assessmentInput?.evidenceCutoff ?? null,
    ownerUserId: assessmentInput?.ownerUserId ?? null,
  }) : null;
  if (projection && projection.status !== "projected") return blocked(projection.blockedReason);
  const sleep = projection
    ? { authorized: true, reason: null, records: projection.records }
    : selectAuthorizedSleep({
      records: assessmentInput?.sleepRecords ?? [],
      authority,
      evidenceCutoff: assessmentInput?.evidenceCutoff,
    });
  if (!sleep.authorized) return blocked(sleep.reason);
  const assessment = createRecoveryBriefingAssessmentV1({
    mode: RecoveryAssessmentMode.SHADOW,
    period: assessmentInput?.period,
    evidenceCutoff: assessmentInput?.evidenceCutoff,
    evaluatedAt: assessmentInput?.evaluatedAt,
    sleepEvidence: sleep.records,
    foamRolling: assessmentInput?.foamRolling,
    training: assessmentInput?.training,
  });
  validateRecoveryBriefingAssessmentV1(assessment);
  return deepFreeze({
    schemaVersion: RECOVERY_BRIEFING_SHADOW_RESULT_VERSION,
    shadow: true,
    status: "shadow_evaluated",
    assessment,
    eligibility: projection ? { floor: projection.floor, windows: projection.windows,
      accounting: projection.accounting } : null,
    authority: {
      schemaVersion: authority.schemaVersion,
      mode: authority.mode,
      effectiveSleepDay: authority.effectiveSleepDay,
      strategicEvidenceEligibility: "excluded",
    },
    isolation: isolationLedger(),
    provenance: {
      producer: "recovery_briefing_shadow_service_v1",
      repositoryReads: 0,
      persistenceWrites: 0,
      runtimeClockReads: 0,
      acceptedSleepRecords: sleep.records.length,
      historicalSleepRecords: 0,
    },
  });
}

/** Only for the synthetic fixture mode: prospective input never comes here. */

export function resolveRecoveryShadowInputAuthorityV1(value) {
  const off = (invalidReason) => deepFreeze({
    enabled: false,
    schemaVersion: RECOVERY_SHADOW_INPUT_AUTHORITY_VERSION,
    mode: null,
    effectiveSleepDay: null,
    invalidReason,
  });
  if (!value) return off("recovery_shadow_input_authority_absent");
  if (value.schemaVersion !== RECOVERY_SHADOW_INPUT_AUTHORITY_VERSION) {
    return off("recovery_shadow_input_authority_version_invalid");
  }
  if (value.status !== "enabled") return off("recovery_shadow_input_authority_disabled");
  if (!Object.values(RecoveryShadowInputMode).includes(value.mode)) {
    return off("recovery_shadow_input_mode_invalid");
  }
  if (value.historicalBackfill !== false ||
      value.strategicEvidenceEligibility !== "excluded" ||
      value.briefingPublication !== false || value.clientReadPath !== false ||
      value.persistence !== "none") {
    return off("recovery_shadow_isolation_contract_invalid");
  }
  const effectiveSleepDay = value.mode === RecoveryShadowInputMode.PROSPECTIVE_VALIDATION_ONLY
    ? validDate(value.effectiveSleepDay) : null;
  if (value.mode === RecoveryShadowInputMode.PROSPECTIVE_VALIDATION_ONLY && !effectiveSleepDay) {
    return off("recovery_shadow_effective_sleep_day_invalid");
  }
  return deepFreeze({
    enabled: true,
    schemaVersion: RECOVERY_SHADOW_INPUT_AUTHORITY_VERSION,
    mode: value.mode,
    effectiveSleepDay,
    invalidReason: null,
  });
}

function selectAuthorizedSleep({ records, authority, evidenceCutoff }) {
  if (!Array.isArray(records)) return { authorized: false, reason: "recovery_shadow_sleep_records_invalid" };
  const forbiddenHistorical = records.some((record) => [
    record?.ingestionPurpose,
    record?.origin,
    record?.provenance?.ingestionPurpose,
    record?.provenance?.origin,
  ].some((purpose) => ["historical_evidence_import", "historical_validation"].includes(purpose)));
  if (forbiddenHistorical) {
    return { authorized: false, reason: "historical_sleep_categorically_forbidden" };
  }
  const requiredPurpose = ALLOWED_PURPOSE_BY_MODE[authority.mode];
  const eligible = [];
  for (const record of records) {
    const purposes = [...new Set([
      record?.ingestionPurpose,
      record?.origin,
      record?.provenance?.ingestionPurpose,
      record?.provenance?.origin,
    ].filter(Boolean))];
    if (purposes.length !== 1 || purposes[0] !== requiredPurpose) {
      return { authorized: false, reason: "sleep_purpose_not_authorized_for_shadow" };
    }
    const sleepDay = record?.sleepDay ?? record?.date;
    if (!validDate(sleepDay)) continue;
    if (authority.effectiveSleepDay && sleepDay < authority.effectiveSleepDay) continue;
    const availableAt = record.availableAt ?? record.ingestedAt ?? record.recordedAt ??
      record.computedAt ?? record.provenance?.computedAt ?? null;
    // A fixture night without an availability instant is never assumed to
    // have been on time; the assessment then treats it as unreliable.
    if (!validTimestamp(evidenceCutoff)) {
      return { authorized: false, reason: "recovery_shadow_evidence_cutoff_invalid" };
    }
    const seconds = Number(record?.mainSleep?.asleepSeconds ?? record?.asleepSeconds);
    if (record?.status !== "asleep_recorded" || !Number.isFinite(seconds) || seconds <= 0) continue;
    const episode = record?.episodes?.[record.mainEpisodeIndex] ??
      record?.episodes?.find((item) => item?.kind === "main") ?? null;
    const timeZoneUncertain = record?.timeZoneUncertain === true ||
      episode?.timeZoneSource === "device_at_ingest";
    eligible.push({
      id: String(record.id ?? `sleep|${sleepDay}`),
      sleepDay,
      totalSleepMinutes: seconds / 60,
      durationReliable: true,
      timeZoneUncertain,
      clockTimeReliable: !timeZoneUncertain && Boolean(episode?.timeZone),
      availableAt,
    });
  }
  return { authorized: true, reason: null, records: eligible };
}

function blocked(reason) {
  return deepFreeze({
    schemaVersion: RECOVERY_BRIEFING_SHADOW_RESULT_VERSION,
    shadow: true,
    status: "shadow_blocked",
    reason,
    assessment: null,
    authority: null,
    isolation: isolationLedger(),
    provenance: {
      producer: "recovery_briefing_shadow_service_v1",
      repositoryReads: 0,
      persistenceWrites: 0,
      runtimeClockReads: 0,
      acceptedSleepRecords: 0,
      historicalSleepRecords: 0,
    },
  });
}

function isolationLedger() {
  return {
    strategic: false,
    userFacing: false,
    briefingArtifactMutation: false,
    v3ObservationMutation: false,
    confidenceMutation: false,
    narrativeMutation: false,
    recommendationMutation: false,
    evidenceEligibilityMutation: false,
    settlementReadinessMutation: false,
    historicalMutation: false,
    clientReadPath: false,
    persistence: "none",
    independentlyReversible: true,
  };
}

function validDate(value) {
  const text = String(value ?? "");
  if (!DATE.test(text)) return null;
  const parsed = new Date(`${text}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text
    ? text : null;
}

function validTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
