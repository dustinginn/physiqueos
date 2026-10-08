import { createHash } from "node:crypto";
import {
  createRecoveryBriefingAssessmentV1,
  validateRecoveryBriefingAssessmentV1,
} from "./RecoveryBriefingAssessmentServiceV1.js";
import {
  BRIEFING_RECOVERY_ASSESSMENT_SCHEMA_VERSION,
  RECOVERY_BRIEFING_CADENCES,
  RECOVERY_BRIEFING_PUBLICATION_AUTHORITY_VERSION,
  RECOVERY_STATUS_POLICY_V1,
  RecoveryAssessmentMode,
} from "./RecoveryBriefingPolicyV1.js";
import { projectRecoverySleepInputsV1 } from "./RecoveryBriefingSleepInputProjectionV1.js";
import { resolveIntelligenceEvidenceCutoff } from "./IntelligenceLifecycleIdentityService.js";

// Future-only Recovery card publication for NEW Weekly and Monthly artifacts.
//
//   publication authority (Server-owned, ABSENT = OFF, fail-closed)
//     -> cadence gate (Weekly/Monthly only; everything else never computes)
//     -> canonical Sleep v3 input projection (non-strategic, prospective-only)
//     -> pure Recovery assessment (publication mode)
//     -> baseline gate (>= 14 reliable prior nights, else NO field at all)
//     -> one optional immutable `briefing.recoveryAssessment` envelope
//
// Nothing here decides settlement readiness, Goal/Strategy Confidence, V3
// Narrative, recommendations, strategic eligibility or algorithm selection,
// and nothing here reads or writes a store. A composition that is disabled,
// excluded, not yet eligible or failing leaves the artifact as the SAME
// object, so an existing artifact is byte-identical with Recovery off.
//
// The field is ABSENT (never null, never an empty placeholder) everywhere it
// is not published, and it is forbidden on Midweek, DEXA, Photo and every
// other briefing type (`assertRecoveryCadenceInvariantV1`).

export const RECOVERY_BRIEFING_PUBLICATION_VERSION = "recovery_briefing_publication_v1";
export const RECOVERY_CARD_PRESENTATION = "single_recovery_card_v1";
export const RECOVERY_NATIVE_CARD_SCHEMA_VERSION = "recovery_card_v1";
export const RECOVERY_ASSESSMENT_FIELD = "recoveryAssessment";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export const RecoveryPublicationReason = Object.freeze({
  CADENCE_EXCLUDED: "cadence_excluded",
  AUTHORITY_DISABLED: "publication_authority_disabled",
  CADENCE_NOT_AUTHORIZED: "cadence_not_authorized",
  PERIOD_BEFORE_EFFECTIVE: "period_before_publication_effective",
  WINDOW_NOT_CLOSED: "evidence_window_not_closed",
  CUTOFF_UNAVAILABLE: "evidence_cutoff_unavailable",
  SLEEP_INPUT_BLOCKED: "sleep_input_blocked",
  BASELINE_NOT_ELIGIBLE: "baseline_not_yet_eligible",
  PUBLISHED: "recovery_card_published",
  COMPOSITION_FAILED: "recovery_composition_failed",
});

/** ABSENT/disabled/malformed = OFF. Never throws. */
export function resolveRecoveryBriefingPublicationAuthorityV1(record) {
  const off = (invalidReason) => Object.freeze({
    enabled: false,
    schemaVersion: RECOVERY_BRIEFING_PUBLICATION_AUTHORITY_VERSION,
    cadences: Object.freeze([]),
    effectiveFromPeriodStart: null,
    recoveryEffectiveSleepDay: null,
    authorizationRef: null,
    invalidReason,
  });
  try {
    if (!record) return off("recovery_publication_authority_absent");
    if (record.schemaVersion !== RECOVERY_BRIEFING_PUBLICATION_AUTHORITY_VERSION) {
      return off("recovery_publication_authority_version_invalid");
    }
    if (record.status !== "enabled") return off("recovery_publication_authority_disabled");
    // An authority naming ANY other cadence is malformed as a whole, never
    // silently narrowed: a Midweek/DEXA/Photo grant turns Recovery fully OFF.
    const cadences = Array.isArray(record.cadences) ? [...new Set(record.cadences)] : [];
    if (cadences.length === 0 || cadences.some((cadence) => !RECOVERY_BRIEFING_CADENCES.includes(cadence))) {
      return off("recovery_publication_cadences_invalid");
    }
    if (record.strategicEvidenceEligibility !== "excluded" || record.historicalBackfill !== false ||
        record.artifactRewrite !== false || record.publishBeforeBaselineEligible !== false) {
      return off("recovery_publication_isolation_contract_invalid");
    }
    if (!isDate(record.effectiveFromPeriodStart) || !isDate(record.recoveryEffectiveSleepDay)) {
      return off("recovery_publication_dates_invalid");
    }
    if (typeof record.authorizationRef !== "string" || !record.authorizationRef.trim() ||
        record.authorizationRef.length > 200) {
      return off("recovery_publication_authorization_ref_invalid");
    }
    return Object.freeze({
      enabled: true,
      schemaVersion: RECOVERY_BRIEFING_PUBLICATION_AUTHORITY_VERSION,
      cadences: Object.freeze(RECOVERY_BRIEFING_CADENCES.filter((cadence) => cadences.includes(cadence))),
      effectiveFromPeriodStart: record.effectiveFromPeriodStart,
      recoveryEffectiveSleepDay: record.recoveryEffectiveSleepDay,
      authorizationRef: record.authorizationRef.trim(),
      invalidReason: null,
    });
  } catch {
    return off("recovery_publication_authority_unreadable");
  }
}

/** Whether Recovery may be considered at all, decided before any Sleep read. */
export function preflightRecoveryPublicationV1({ authority, cadence, window } = {}) {
  if (!RECOVERY_BRIEFING_CADENCES.includes(cadence)) return refusal(RecoveryPublicationReason.CADENCE_EXCLUDED);
  if (!authority?.enabled) return refusal(RecoveryPublicationReason.AUTHORITY_DISABLED);
  if (!authority.cadences.includes(cadence)) return refusal(RecoveryPublicationReason.CADENCE_NOT_AUTHORIZED);
  if (!window || !isDate(window.startDate) || !isDate(window.endDate)) return refusal(RecoveryPublicationReason.CUTOFF_UNAVAILABLE);
  if (window.startDate < authority.effectiveFromPeriodStart) return refusal(RecoveryPublicationReason.PERIOD_BEFORE_EFFECTIVE);
  if (window.closed !== true) return refusal(RecoveryPublicationReason.WINDOW_NOT_CLOSED);
  const evidenceCutoff = resolveWindowCutoff(window);
  if (!evidenceCutoff) return refusal(RecoveryPublicationReason.CUTOFF_UNAVAILABLE);
  return Object.freeze({
    proceed: true,
    evidenceCutoff,
    readRange: Object.freeze({
      startDate: shift(window.startDate, -RECOVERY_STATUS_POLICY_V1.baseline.lookbackNights),
      endDate: window.endDate,
    }),
  });
}

/**
 * Pure composition. `sleepInputs` = `{ sleepDays, activationPolicyRecord,
 * algorithmPolicyRecord }` read for `preflight.readRange`.
 */
export function composeRecoveryAssessmentForBriefingV1({
  authority, cadence, window, artifactId, ownerUserId = null, evaluatedAt, sleepInputs = null,
} = {}) {
  const preflight = preflightRecoveryPublicationV1({ authority, cadence, window });
  if (!preflight.proceed) return preflight;
  const projection = projectRecoverySleepInputsV1({
    sleepDays: sleepInputs?.sleepDays ?? [],
    activationPolicyRecord: sleepInputs?.activationPolicyRecord ?? null,
    algorithmPolicyRecord: sleepInputs?.algorithmPolicyRecord ?? null,
    recoveryEffectiveSleepDay: authority.recoveryEffectiveSleepDay,
    period: { cadence, startDate: window.startDate, endDate: window.endDate },
    evidenceCutoff: preflight.evidenceCutoff,
    ownerUserId,
  });
  if (projection.status !== "projected") {
    return refusal(RecoveryPublicationReason.SLEEP_INPUT_BLOCKED, { detail: projection.blockedReason });
  }
  const assessment = createRecoveryBriefingAssessmentV1({
    mode: RecoveryAssessmentMode.PUBLICATION,
    period: { cadence, startDate: window.startDate, endDate: window.endDate, timeZone: window.timeZone },
    evidenceCutoff: preflight.evidenceCutoff,
    evaluatedAt,
    sleepEvidence: projection.records,
    // No authoritative foam schedule or bounded training-constraint source is
    // wired to Recovery yet: both are explicit limitations, never invented.
    foamRolling: null,
    training: null,
  });
  const eligibility = createEligibility({ cadence, projection });
  if (eligibility.baselineReliableNights < eligibility.baselineRequiredNights) {
    return refusal(RecoveryPublicationReason.BASELINE_NOT_ELIGIBLE, { eligibility });
  }
  const body = {
    schemaVersion: BRIEFING_RECOVERY_ASSESSMENT_SCHEMA_VERSION,
    publicationVersion: RECOVERY_BRIEFING_PUBLICATION_VERSION,
    presentation: RECOVERY_CARD_PRESENTATION,
    cadence,
    artifactId,
    evidenceWindowId: window.id ?? null,
    assessment,
    eligibility,
    authority: {
      schemaVersion: authority.schemaVersion,
      authorizationRef: authority.authorizationRef,
      effectiveFromPeriodStart: authority.effectiveFromPeriodStart,
    },
    isolation: isolationContract(),
  };
  const recoveryAssessment = deepFreeze({ ...body, integrity: { algorithm: "sha256:stable-json", digest: digest(body) } });
  validateBriefingRecoveryAssessmentV1(recoveryAssessment);
  return Object.freeze({ proceed: true, attach: true, reason: RecoveryPublicationReason.PUBLISHED, eligibility, recoveryAssessment });
}

export function validateBriefingRecoveryAssessmentV1(value, { cadence = null, artifactId = null, evidenceWindow = null } = {}) {
  const isolation = isolationContract();
  if (evidenceWindow !== null && (value?.evidenceWindowId !== (evidenceWindow.id ?? null) ||
      value?.assessment?.period?.startDate !== evidenceWindow.startDate ||
      value?.assessment?.period?.endDate !== evidenceWindow.endDate)) {
    throw recoveryError("Briefing Recovery assessment does not belong to this evidence window.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      value.schemaVersion !== BRIEFING_RECOVERY_ASSESSMENT_SCHEMA_VERSION ||
      value.publicationVersion !== RECOVERY_BRIEFING_PUBLICATION_VERSION ||
      value.presentation !== RECOVERY_CARD_PRESENTATION ||
      !RECOVERY_BRIEFING_CADENCES.includes(value.cadence) ||
      (cadence !== null && value.cadence !== cadence) ||
      (artifactId !== null && value.artifactId !== artifactId) ||
      value.assessment?.mode !== RecoveryAssessmentMode.PUBLICATION ||
      value.assessment?.period?.cadence !== value.cadence ||
      Object.entries(isolation).some(([key, expected]) => value.isolation?.[key] !== expected) ||
      !(value.eligibility?.baselineReliableNights >= RECOVERY_STATUS_POLICY_V1.baseline.minimumUsableNights)) {
    throw recoveryError("Invalid Briefing Recovery assessment.");
  }
  validateRecoveryBriefingAssessmentV1(value.assessment);
  const { integrity, ...body } = value;
  if (integrity?.digest !== digest(body)) throw recoveryError("Briefing Recovery assessment integrity mismatch.");
  return value;
}

/** Returns the SAME artifact unless the decision attaches a card. */
export function attachRecoveryAssessmentV1(artifact, decision) {
  if (!decision?.attach) return artifact;
  const envelope = decision.recoveryAssessment;
  validateBriefingRecoveryAssessmentV1(envelope, { cadence: artifact?.cadence, artifactId: artifact?.id, evidenceWindow: artifact?.evidenceWindow ?? {} });
  if (artifact.artifactType === "event") throw recoveryError("Recovery is forbidden on event briefings.");
  const result = { ...artifact, briefing: { ...artifact.briefing, [RECOVERY_ASSESSMENT_FIELD]: envelope } };
  assertRecoveryCadenceInvariantV1(result);
  return result;
}

/**
 * Regeneration / correction never adds, removes or recomputes Recovery: the
 * replacement carries the published envelope exactly as first published, or
 * stays without one. Returns the SAME artifact when nothing changes.
 */
export function carryForwardRecoveryAssessmentV1({ existing, artifact } = {}) {
  const had = hasRecoveryField(existing);
  const has = hasRecoveryField(artifact);
  if (!had && !has) return artifact;
  const briefing = { ...artifact.briefing };
  if (had) briefing[RECOVERY_ASSESSMENT_FIELD] = structuredClone(existing.briefing[RECOVERY_ASSESSMENT_FIELD]);
  else delete briefing[RECOVERY_ASSESSMENT_FIELD];
  return { ...artifact, briefing };
}

/**
 * The product-level NO RECOVERY OUTSIDE WEEKLY/MONTHLY invariant, for every
 * artifact write. A present field must be a valid envelope for this exact
 * Weekly/Monthly artifact: null, an empty object or a placeholder is refused.
 */
export function assertRecoveryCadenceInvariantV1(artifact) {
  if (!hasRecoveryField(artifact)) return artifact;
  if (!RECOVERY_BRIEFING_CADENCES.includes(artifact?.cadence) || artifact?.artifactType === "event") {
    throw recoveryError("Recovery is published only on Weekly and Monthly briefings.");
  }
  validateBriefingRecoveryAssessmentV1(artifact.briefing[RECOVERY_ASSESSMENT_FIELD], {
    cadence: artifact.cadence, artifactId: artifact.id, evidenceWindow: artifact.evidenceWindow ?? {},
  });
  return artifact;
}

/** The single Weekly/Monthly Recovery card read model, or null (key omitted). */
export function projectRecoveryCardForNativeV1(artifact) {
  if (!hasRecoveryField(artifact) || !RECOVERY_BRIEFING_CADENCES.includes(artifact?.cadence) ||
      artifact?.artifactType === "event") return null;
  let envelope;
  try {
    envelope = validateBriefingRecoveryAssessmentV1(artifact.briefing[RECOVERY_ASSESSMENT_FIELD], {
      cadence: artifact.cadence, artifactId: artifact.id, evidenceWindow: artifact.evidenceWindow ?? {},
    });
  } catch {
    return null;
  }
  const { assessment } = envelope;
  return deepFreeze({
    schemaVersion: RECOVERY_NATIVE_CARD_SCHEMA_VERSION,
    presentation: RECOVERY_CARD_PRESENTATION,
    cadence: envelope.cadence,
    assessmentId: assessment.assessmentId,
    status: { state: assessment.status.state, label: assessment.status.label },
    period: {
      startDate: assessment.period.startDate,
      endDate: assessment.period.endDate,
      expectedNights: assessment.period.expectedNights,
      observedNights: assessment.period.observedNights,
    },
    sleep: {
      averageMinutes: assessment.sleep.periodSummary.averageMinutes,
      baselineMinutes: assessment.sleep.baseline.centerMinutes,
      deltaFromBaselineMinutes: assessment.sleep.periodSummary.deltaFromBaselineMinutes,
      baselineNights: assessment.sleep.baseline.usableNights,
      baselineLookbackNights: assessment.sleep.baseline.lookbackNights,
      trend: {
        granularity: assessment.sleep.trend.granularity,
        points: assessment.sleep.trend.points.map((point) => ({
          label: point.label, totalSleepMinutes: point.totalSleepMinutes,
        })),
      },
    },
    commentary: assessment.commentary,
    foamRolling: {
      state: assessment.foamRolling.state,
      scheduledOccurrences: assessment.foamRolling.scheduledOccurrences,
      completedOccurrences: assessment.foamRolling.completedOccurrences,
    },
    dataLimitations: assessment.dataLimitations,
  });
}

// The window's own cutoff, or (a closed-window contract carries none) the end
// of its final local day in its own zone: the same rule the cadence V3
// lifecycle applies to the artifact.
function resolveWindowCutoff(window) {
  try {
    const value = typeof window.cutoff === "string" && Number.isFinite(Date.parse(window.cutoff))
      ? new Date(window.cutoff).toISOString()
      : resolveIntelligenceEvidenceCutoff({ value: window.endDate, timeZone: window.timeZone });
    return value.slice(0, 10) >= window.endDate ? value : null;
  } catch {
    return null;
  }
}

function hasRecoveryField(artifact) {
  const briefing = artifact?.briefing;
  return Boolean(briefing && typeof briefing === "object" &&
    Object.prototype.hasOwnProperty.call(briefing, RECOVERY_ASSESSMENT_FIELD));
}

function createEligibility({ cadence, projection }) {
  const policy = RECOVERY_STATUS_POLICY_V1.cadences[cadence];
  return {
    prospectiveFloor: projection.floor.prospectiveFloor,
    baselineStartDate: projection.windows.baseline.startDate,
    baselineEndDate: projection.windows.baseline.endDate,
    baselineRequiredNights: RECOVERY_STATUS_POLICY_V1.baseline.minimumUsableNights,
    baselineReliableNights: projection.accounting.baseline.reliableNights,
    periodExpectedNights: projection.windows.period.expectedNights,
    periodRequiredNights: policy.minimumPeriodNights,
    periodReliableNights: projection.accounting.period.reliableNights,
    baseline: projection.accounting.baseline,
    period: projection.accounting.period,
  };
}

function isolationContract() {
  return {
    strategicEligibility: "excluded",
    confidenceCoupling: "none",
    narrativeCoupling: "none",
    recommendationCoupling: "none",
    settlementCoupling: "none",
    historicalRewrite: false,
  };
}

function refusal(reason, extra = {}) {
  return Object.freeze({ proceed: false, attach: false, reason, ...extra });
}

function recoveryError(message) {
  const error = new Error(message);
  error.code = "recovery_assessment_invalid";
  return error;
}

function isDate(value) {
  if (!DATE.test(String(value ?? ""))) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function shift(value, amount) {
  return new Date(Date.parse(`${value}T12:00:00Z`) + amount * DAY_MS).toISOString().slice(0, 10);
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return `sha256_${createHash("sha256").update(stableSerialize(value)).digest("hex")}`;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
