import { createHash } from "node:crypto";
import { validateForecastAssessment } from "../forecast/ForecastAssessmentModel";

export const NUMERIC_CONFIDENCE_PROJECTION_VERSION =
  "numeric_confidence_projection_v2_durability_v1";

const BAND_TARGET = Object.freeze({
  very_low: 22, low: 34, developing: 47, moderate: 62, high: 78, very_high: 90,
});
const MOVEMENT_CEILING = Object.freeze({
  goal_initialization: 100,
  midweek_briefing: 2,
  weekly_briefing: 3,
  monthly_briefing: 5,
  dexa_event_briefing: 8,
  photo_event_briefing: 3,
});
const PROXY_MOVEMENT_CEILING = Object.freeze({
  midweek_briefing: 1,
  weekly_briefing: 1,
  monthly_briefing: 2,
  photo_event_briefing: 1,
});
const RAW_EVIDENCE_KEY = /^(rawEvidence|evidenceDescriptors|sourceObservations|sourceClaims|canonicalEvidence|dexaScans|photos|weights|workouts)$/i;

export function projectNumericConfidence(input = {}) {
  rejectRawEvidence(input);
  validateForecastAssessment(input.forecastAssessment);
  const forecast = input.forecastAssessment;
  const publisherType = required(input.publisherType, "publisherType");
  if (!(publisherType in MOVEMENT_CEILING)) {
    throw new Error("Numeric projection publisher is not authorized.");
  }
  const previous = normalizePrevious(input.previousCanonicalAssessment);
  const semanticFingerprint = required(
    forecast.forecastMetadata.interpretationSemanticFingerprint,
    "interpretationSemanticFingerprint"
  );
  const identical = previous?.semanticContinuityFingerprint === semanticFingerprint;
  const target = boundedTarget(forecast);
  let current;
  let rationale;
  let appliedCeiling = null;
  const proxyMovement = ["proxy_durability_transition",
    "uncertainty_reduction"].includes(forecast.movement.kind);
  if (!previous) {
    current = startingValue(target, input.startingForecastContext);
    rationale = "starting_forecast_from_structured_context";
  } else if (identical || forecast.movement.direction === "no_meaningful_change") {
    current = previous.currentPercentage;
    rationale = identical
      ? "semantic_continuity_held"
      : "forecast_no_meaningful_change";
  } else {
    const globalCeiling = MOVEMENT_CEILING[publisherType];
    const proxyCeiling = proxyMovement
      ? PROXY_MOVEMENT_CEILING[publisherType] ?? globalCeiling
      : globalCeiling;
    const ceiling = Math.min(globalCeiling, proxyCeiling);
    appliedCeiling = ceiling;
    const desiredDelta = target - previous.currentPercentage;
    if (forecast.movement.direction === "increase") {
      if (desiredDelta <= 0) {
        current = previous.currentPercentage;
        rationale = "bounded_target_prevented_increase";
      } else {
        current = previous.currentPercentage + Math.min(ceiling, desiredDelta);
        rationale = proxyMovement
          ? "proxy_semantic_transition_with_bounded_ceiling"
          : "forecast_materially_strengthened_with_publisher_ceiling";
      }
    } else {
      current = previous.currentPercentage - Math.min(
        ceiling, Math.max(1, -desiredDelta)
      );
      rationale = "forecast_materially_weakened_with_publisher_ceiling";
    }
  }
  current = clamp(Math.round(current), 1, 99);
  const prior = previous?.currentPercentage ?? null;
  const delta = prior == null ? null : current - prior;
  const movement = delta == null || delta === 0
    ? "no_meaningful_change" : delta > 0 ? "increase" : "decrease";
  const movementAudit = {
    forecastMovementKind: forecast.movement.kind ?? "unknown",
    forecastMovementReasonCode: forecast.movement.reasonCode ??
      forecast.movement.rationale,
    triggeringCapabilities: [...(forecast.movement.triggeringCapabilities ?? [])],
    priorPersistence: forecast.movement.priorPersistence ?? null,
    currentPersistence: forecast.movement.currentPersistence ?? null,
    independentPeriodCount: forecast.movement.independentPeriodCount ?? 0,
    periodId: forecast.movement.periodId ?? null,
    corroboratingCapabilityCount:
      forecast.movement.corroboratingCapabilityCount ?? 0,
    reducedUncertaintyKeys: [...(forecast.movement.reducedUncertaintyKeys ?? [])],
    proxyMovement,
    proxyCap: proxyMovement ? PROXY_MOVEMENT_CEILING[publisherType] ?? null : null,
    globalCadenceCap: MOVEMENT_CEILING[publisherType],
    appliedCeiling,
    boundedTarget: target,
    finalDelta: delta,
  };
  const semantic = {
    version: NUMERIC_CONFIDENCE_PROJECTION_VERSION,
    publisherType,
    forecastId: forecast.id,
    previousAssessmentId: previous?.assessmentId ?? null,
    priorPercentage: prior,
    currentPercentage: current,
    movement,
    semanticFingerprint,
    rationale,
    movementAudit,
  };
  return deepFreeze({
    schemaVersion: NUMERIC_CONFIDENCE_PROJECTION_VERSION,
    id: `numeric_confidence_projection|${hash(semantic)}`,
    ...semantic,
    delta,
    movementMagnitude: magnitude(Math.abs(delta ?? 0)),
    confidenceBand: forecast.confidenceBand,
    boundedBy: publisherType,
    deterministic: true,
    explanationCodes: Object.freeze([
      rationale,
      forecast.movement.reasonCode ?? forecast.movement.rationale,
      `goal_${forecast.goalForecastStatus}`,
      `band_${forecast.confidenceBand}`,
      ...guardrailCodes(forecast),
    ]),
  });
}

function boundedTarget(forecast) {
  let target = BAND_TARGET[forecast.confidenceBand];
  if (forecast.goalForecastStatus === "ahead_of_forecast") target += 3;
  if (forecast.goalForecastStatus === "forecast_at_risk") target -= 4;
  if (forecast.goalForecastStatus === "forecast_unlikely") target -= 8;
  if (forecast.guardrailForecasts.some((item) =>
    item.forecastState === "unlikely_respected")) target = Math.min(target, 35);
  else if (forecast.guardrailForecasts.some((item) =>
    item.forecastState === "at_risk")) target = Math.min(target, 48);
  if (forecast.timeline.phase === "overdue") target = Math.min(target, 30);
  if (forecast.remainingUncertainty.status === "material") target -= 2;
  return clamp(target, 10, 95);
}

function startingValue(target, context = {}) {
  const newUser = context?.experience === "new_user";
  let adjustment = 0;
  adjustment += ({ low: 2, moderate: 0, high: -3 })[context?.goalAmbition] ?? 0;
  adjustment += ({ generous: 2, reasonable: 0, compressed: -3,
    unknown: -1 })[context?.timelineFeasibility] ?? 0;
  adjustment += ({ known: 2, partial: 0, missing: -2 })[context?.baselineQuality] ?? 0;
  adjustment += ({ strong: 3, mixed: 0, weak: -2,
    unavailable: 0 })[context?.priorGoalHistory] ?? 0;
  adjustment += ({ strong: 2, adequate: 1, mixed: 0, weak: -2,
    unavailable: 0 })[context?.historicalExecution] ?? 0;
  adjustment += ({ strong: 3, adequate: 1, incomplete: -2,
    unknown: -1 })[context?.strategyQuality] ?? 0;
  adjustment -= Math.min(6, Number(context?.missingInformationCount ?? 0));
  const floor = newUser ? 45 : 30;
  return clamp(target + adjustment, floor, 85);
}

function normalizePrevious(value) {
  if (!value) return null;
  const currentPercentage = Number(value.currentPercentage ?? value.score?.current);
  if (!Number.isFinite(currentPercentage)) {
    throw new Error("Previous canonical percentage is invalid.");
  }
  return {
    assessmentId: value.assessmentId ?? value.id ?? null,
    currentPercentage,
    semanticContinuityFingerprint: value.semanticContinuityFingerprint ??
      value.reproducibility?.semanticContinuityFingerprint ?? null,
  };
}

function rejectRawEvidence(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (RAW_EVIDENCE_KEY.test(key)) {
      throw new Error(`Numeric projection cannot consume ${key}.`);
    }
    rejectRawEvidence(child);
  }
}
function guardrailCodes(forecast) {
  return forecast.guardrailForecasts.map((item) =>
    `guardrail_${item.forecastState}:${item.guardrailId}`);
}
function magnitude(value) {
  if (value === 0) return "none";
  if (value <= 2) return "small";
  if (value <= 5) return "moderate";
  return "material";
}
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function required(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value;
}
function hash(value) {
  return createHash("sha256").update(stable(value)).digest("hex");
}
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
