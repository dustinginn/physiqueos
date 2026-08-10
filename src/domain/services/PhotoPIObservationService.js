import { createPIObservation, sortPIObservations } from "./PIObservationService";

export const PHOTO_PI_PRODUCER_VERSION = "photo_pi_v1";

const KIND_BY_METRIC = Object.freeze({
  leanness: "photo_leanness_change",
  abdominal_definition: "photo_abdominal_definition_change",
  whole_body_softness: "photo_whole_body_softness_change",
  muscularity: "photo_muscularity_change",
  visual_stability: "photo_visual_stability",
});

export function createPhotoPIObservations({
  comparisons = [],
  sessions = [],
  includeInsufficientData = true,
} = {}) {
  const before = structuredClone({ comparisons, sessions });
  const normalized = normalizeComparisons(comparisons.length ? comparisons : deriveComparisons(sessions));
  const observations = [];

  for (const comparison of normalized) {
    observations.push(comparabilityObservation(comparison));
    if (!comparison.eligible) continue;
    for (const finding of comparison.findings) {
      const kind = KIND_BY_METRIC[finding.metric];
      if (!kind) continue;
      observations.push(changeObservation(comparison, finding, kind));
    }
  }
  if (!normalized.length && includeInsufficientData) {
    observations.push(insufficientObservation("photo_comparison_unavailable"));
  } else if (!observations.some((item) => item.kind in reverseKinds()) && includeInsufficientData) {
    observations.push(insufficientObservation("structured_photo_semantics_unavailable", normalized));
  }

  const deduplicated = [...new Map(observations.map((item) => [item.id, item])).values()];
  if (JSON.stringify({ comparisons, sessions }) !== JSON.stringify(before)) {
    throw new Error("Photo PI input mutation detected.");
  }
  return sortPIObservations(deduplicated);
}

function changeObservation(comparison, finding, kind) {
  const ids = evidenceIds(comparison);
  const confidence = photoConfidence(comparison, finding);
  return createPIObservation({
    domain: "photos",
    kind,
    semanticScope: `same_pose:${machineKey(comparison.poseId)}`,
    subject: {
      type: "visual_body_composition_metric",
      id: finding.metric,
      label: label(finding.metric),
    },
    status: finding.direction === "stable" ? "stable" : "observed",
    direction: finding.direction,
    evidenceWindow: comparisonWindow(comparison),
    supportingEvidenceIds: ids,
    confidence,
    explanationData: {
      currentSessionId: comparison.currentSessionId,
      comparisonSessionId: comparison.comparisonSessionId,
      currentViewId: comparison.currentViewId,
      comparisonViewId: comparison.comparisonViewId,
      poseId: comparison.poseId,
      bodyView: comparison.bodyView,
      contractionState: comparison.contractionState,
      metric: finding.metric,
      magnitude: finding.magnitude,
      comparisonQuality: comparison.quality,
      repeatedDirectionCount: finding.repeatedDirectionCount,
      comparability: structuredClone(comparison.comparability),
      limitations: [...new Set([...comparison.limitations, ...finding.limitations])].sort(),
    },
    provenance: provenance(ids, "same_pose_structured_photo_comparison"),
  });
}

function comparabilityObservation(comparison) {
  const ids = evidenceIds(comparison);
  return createPIObservation({
    domain: "photos",
    kind: "photo_comparability",
    semanticScope: `same_pose:${machineKey(comparison.poseId)}`,
    subject: { type: "photo_comparison", id: `photo_comparability:${machineKey(comparison.poseId)}`, label: "Photo comparability" },
    status: comparison.eligible ? "observed" : "insufficient_data",
    direction: "not_applicable",
    evidenceWindow: comparisonWindow(comparison),
    supportingEvidenceIds: ids,
    confidence: {
      level: comparison.quality === "high" ? "high" : comparison.quality === "moderate" ? "moderate" : "low",
      limitations: comparison.limitations,
      method: "photo_comparison_quality",
    },
    explanationData: {
      currentSessionId: comparison.currentSessionId,
      comparisonSessionId: comparison.comparisonSessionId,
      poseId: comparison.poseId,
      comparisonQuality: comparison.quality,
      eligible: comparison.eligible,
      comparability: structuredClone(comparison.comparability),
      limitations: comparison.limitations,
    },
    provenance: provenance(ids, "photo_comparability_assessment"),
  });
}

function insufficientObservation(reason, comparisons = []) {
  const ids = [...new Set(comparisons.flatMap(evidenceIds))].sort();
  const dates = comparisons.flatMap((item) => [item.comparisonDate, item.currentDate]).filter(Boolean).sort();
  return createPIObservation({
    domain: "photos",
    kind: "photo_insufficient_comparison",
    semanticScope: "same_pose",
    subject: { type: "photo_comparison", id: "photo_comparison", label: "Photo comparison" },
    status: "insufficient_data",
    direction: "not_applicable",
    evidenceWindow: { startDate: dates[0] ?? null, endDate: dates.at(-1) ?? null },
    supportingEvidenceIds: ids,
    confidence: { level: ids.length ? "low" : "unevaluated", limitations: [reason], method: "photo_comparison_quality" },
    explanationData: { limitations: [reason] },
    provenance: provenance(ids, "insufficient_photo_comparison"),
  });
}

function normalizeComparisons(values) {
  return (Array.isArray(values) ? values : [])
    .map((value) => {
      const poseId = String(value.poseId ?? value.pose?.id ?? "");
      const comparisonPoseId = String(value.comparisonPoseId ?? value.previousPoseId ?? poseId);
      const contractionState = String(value.contractionState ?? value.poseIdentity?.contractionState ?? "unknown");
      const comparisonContractionState = String(value.comparisonContractionState ?? contractionState);
      const bodyView = String(value.bodyView ?? value.poseIdentity?.orientation ?? poseId.split("-")[0] ?? "unknown");
      const comparisonBodyView = String(value.comparisonBodyView ?? bodyView);
      const imageAvailable = value.imageAvailable !== false && value.comparisonImageAvailable !== false;
      const poseMatch = Boolean(poseId && poseId === comparisonPoseId);
      const contractionMatch = contractionState === comparisonContractionState;
      const bodyViewMatch = bodyView === comparisonBodyView;
      const limitations = [
        !poseMatch ? "pose_mismatch" : null,
        !contractionMatch ? "contraction_state_mismatch" : null,
        !bodyViewMatch ? "body_view_mismatch" : null,
        !imageAvailable ? "comparison_image_unavailable" : null,
        ...(value.limitations ?? value.conditionDifferences ?? []),
      ].filter(Boolean);
      const quality = normalizeQuality(value.comparisonQuality ?? value.comparisonConfidence, limitations, value.comparability);
      return {
        currentSessionId: String(value.currentSessionId ?? value.sessionId ?? ""),
        comparisonSessionId: String(value.comparisonSessionId ?? value.previousSessionId ?? ""),
        currentViewId: String(value.currentViewId ?? value.id ?? ""),
        comparisonViewId: String(value.comparisonViewId ?? value.previousViewId ?? ""),
        currentDate: dateKey(value.currentDate ?? value.captureDate),
        comparisonDate: dateKey(value.comparisonDate ?? value.previousDate),
        poseId,
        bodyView,
        contractionState,
        quality,
        eligible: poseMatch && contractionMatch && bodyViewMatch && imageAvailable && quality !== "insufficient",
        limitations: [...new Set(limitations)].sort(),
        comparability: {
          framing: known(value.framingConsistency),
          lighting: known(value.lightingConsistency),
          distance: known(value.distanceConsistency),
          angle: known(value.angleConsistency),
          contractionState: contractionMatch ? "matched" : "mismatched",
          bodyView: bodyViewMatch ? "matched" : "mismatched",
          timeOfDay: known(value.timeOfDayConsistency),
          pumpState: known(value.pumpStateConsistency),
          clothing: known(value.clothingConsistency),
          mealState: known(value.mealStateConsistency),
        },
        findings: normalizeFindings(value.findings ?? value.structuredFindings ?? []),
      };
    })
    .filter((item) => item.currentSessionId && item.currentDate && item.poseId)
    .sort((left, right) => left.currentDate.localeCompare(right.currentDate) || left.poseId.localeCompare(right.poseId))
    .filter((item, index, all) => index === all.findIndex((other) => `${other.currentSessionId}|${other.poseId}` === `${item.currentSessionId}|${item.poseId}`));
}

function deriveComparisons(sessions) {
  return (Array.isArray(sessions) ? sessions : []).flatMap((session) =>
    (session.views ?? []).map((view) => ({
      currentSessionId: session.id,
      comparisonSessionId: view.comparison?.previousSessionId,
      currentViewId: view.canonicalViewId ?? view.id,
      comparisonViewId: view.comparison?.previousCanonicalViewId,
      currentDate: session.captureDate,
      comparisonDate: view.comparison?.previousDate,
      poseId: view.poseId,
      comparisonPoseId: view.comparison?.previousPose?.id ?? view.poseId,
      contractionState:
        view.poseIdentity?.contractionState ?? view.pose?.pose ?? "unknown",
      comparisonContractionState:
        view.comparison?.previousPose?.contractionState ??
        view.comparison?.previousPose?.pose ??
        view.poseIdentity?.contractionState ??
        view.pose?.pose ??
        "unknown",
      bodyView:
        view.poseIdentity?.orientation ?? view.pose?.view ?? view.poseId?.split("-")[0],
      comparisonBodyView:
        view.comparison?.previousPose?.orientation ??
        view.comparison?.previousPose?.view ??
        view.poseIdentity?.orientation ??
        view.pose?.view ??
        view.poseId?.split("-")[0],
      imageAvailable: Boolean(view.imageHref),
      comparisonImageAvailable: Boolean(view.previousImageHref),
      comparisonQuality:
        view.comparisonConfidence ??
        view.comparison?.comparisonConfidence ??
        (view.comparisonStatus === "comparable" ? "high" : undefined),
      limitations: view.conditionDifferences,
      structuredFindings: view.structuredFindings,
    }))
  );
}

function normalizeFindings(findings) {
  return (Array.isArray(findings) ? findings : [])
    .map((finding) => ({
      metric: String(finding.metric ?? finding.kind ?? "").replace(/^photo_/, ""),
      direction: normalizeDirection(finding.direction),
      magnitude: normalizeMagnitude(finding.magnitude, finding.direction),
      repeatedDirectionCount: Math.max(1, Number(finding.repeatedDirectionCount) || 1),
      limitations: Array.isArray(finding.limitations) ? finding.limitations.map(String) : [],
    }))
    .filter((finding) => KIND_BY_METRIC[finding.metric] && finding.direction !== "unknown");
}

function photoConfidence(comparison, finding) {
  const level = finding.magnitude === "subtle"
    ? "low"
    : comparison.quality === "high" && finding.repeatedDirectionCount >= 2
    ? "high"
    : ["high", "moderate"].includes(comparison.quality) ? "moderate" : "low";
  return {
    level,
    reasons: [`${comparison.quality}_photo_comparability`, `${finding.repeatedDirectionCount}_comparable_direction_observations`],
    limitations: [...new Set([...comparison.limitations, ...finding.limitations])].sort(),
    method: "photo_comparability_and_repetition",
  };
}

function normalizeMagnitude(value, direction) {
  const magnitude = String(value ?? "").toLowerCase();
  if (["none", "subtle", "moderate", "pronounced", "unknown"].includes(magnitude)) return magnitude;
  return normalizeDirection(direction) === "stable" ? "none" : "unknown";
}

function normalizeQuality(value, limitations, comparability) {
  const explicit = String(value ?? "").toLowerCase();
  if (["high", "moderate", "low", "insufficient", "unknown"].includes(explicit)) return explicit;
  if (comparability === false) return "insufficient";
  if (!value && limitations.length === 0) return "unknown";
  return limitations.length > 2 ? "low" : limitations.length ? "moderate" : "high";
}

function normalizeDirection(value) {
  const direction = String(value ?? "").toLowerCase();
  if (direction === "increased") return "rising";
  if (direction === "decreased") return "falling";
  if (["rising", "falling", "stable"].includes(direction)) return direction;
  return "unknown";
}

function evidenceIds(comparison) {
  return [...new Set([
    comparison.currentSessionId,
    comparison.comparisonSessionId,
    comparison.currentViewId,
    comparison.comparisonViewId,
  ].filter(Boolean))].sort();
}

function comparisonWindow(comparison) {
  return {
    startDate: comparison.currentDate,
    endDate: comparison.currentDate,
    comparisonStartDate: comparison.comparisonDate || null,
    comparisonEndDate: comparison.comparisonDate || null,
  };
}

function provenance(ids, calculationMethod) {
  return {
    producer: "photo_pi_observation_service",
    producerVersion: PHOTO_PI_PRODUCER_VERSION,
    calculationMethod,
    sourceEvidenceIds: ids,
  };
}

function reverseKinds() {
  return Object.fromEntries(Object.values(KIND_BY_METRIC).map((kind) => [kind, true]));
}

function label(value) {
  return value.split("_").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}

function known(value) {
  return value == null ? "unknown" : value === true || value === "matched" ? "matched" : value === false || value === "mismatched" ? "mismatched" : String(value);
}

function dateKey(value) {
  const date = String(value ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

function machineKey(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9._|:-]+/g, "_");
}
