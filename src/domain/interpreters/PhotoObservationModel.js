export const PHOTO_INTERPRETATION_SCHEMA_VERSION = "photo_interpretation_v2";

export const PHOTO_INTERPRETATION_METRICS = Object.freeze([
  "leanness",
  "abdominal_definition",
  "whole_body_softness",
  "muscularity",
  "visual_stability",
  "unknown",
]);

export const PHOTO_INTERPRETATION_DIRECTIONS = Object.freeze([
  "increased",
  "decreased",
  "stable",
  "mixed",
  "insufficient",
  "unknown",
]);

export const PHOTO_INTERPRETATION_MAGNITUDES = Object.freeze([
  "none",
  "subtle",
  "moderate",
  "pronounced",
  "unknown",
]);

const PRECISE_BODY_COMPOSITION_PATTERN = /(?:\b(?:body[ -]?fat|lean mass|fat mass)\b[^.!?\n]{0,24}\b\d+(?:\.\d+)?\s*(?:%|lb|lbs|pounds?)(?!\w)|\b\d+(?:\.\d+)?\s*(?:%|lb|lbs|pounds?)?[^.!?\n]{0,12}\b(?:body[ -]?fat|lean mass|fat mass)\b)/i;

export function normalizeStructuredPhotoSemantics(
  values = [],
  {
    comparisonSessionId = null,
    contractionState = "unknown",
    pose = "unknown",
    bodyView = "unknown",
    sourceEvidenceIds = [],
    provenance = {},
  } = {}
) {
  return (Array.isArray(values) ? values : []).map((value) => {
    const metric = String(value?.metric ?? "unknown");
    const direction = String(value?.direction ?? "unknown");
    const magnitude = String(value?.magnitude ?? "unknown");
    const limitations = normalizeStringList(value?.limitations);
    const confidence = normalizeConfidence(value?.confidence);

    validateStructuredPhotoSemantic({
      ...value,
      confidence,
      direction,
      limitations,
      magnitude,
      metric,
    });

    return {
      schemaVersion: PHOTO_INTERPRETATION_SCHEMA_VERSION,
      region: String(value?.region ?? "Photo evidence"),
      metric,
      direction,
      magnitude,
      change: String(value?.change ?? ""),
      confidence,
      limitations,
      pose: String(value?.pose ?? pose),
      bodyView: String(value?.bodyView ?? bodyView),
      contractionState: String(value?.contractionState ?? contractionState),
      comparisonSessionId: value?.comparisonSessionId ?? comparisonSessionId,
      sourceEvidenceIds: normalizeStringList(
        value?.sourceEvidenceIds?.length ? value.sourceEvidenceIds : sourceEvidenceIds
      ),
      provenance: {
        ...provenance,
        ...(value?.provenance ?? {}),
        schemaVersion: PHOTO_INTERPRETATION_SCHEMA_VERSION,
      },
    };
  });
}

export function normalizePhotoModelSemantics(values = []) {
  return (Array.isArray(values) ? values : []).map((value) => {
    const metric = String(value?.metric ?? "unknown");
    const direction = String(value?.direction ?? "unknown");
    const magnitude = String(value?.magnitude ?? "unknown");
    if (direction === "insufficient") {
      return {
        ...value,
        magnitude: "unknown",
        limitations: value?.limitations?.length
          ? value.limitations
          : ["The visual evidence was insufficient to determine direction."],
      };
    }
    if (direction === "unknown") {
      return { ...value, metric: "unknown", magnitude: "unknown" };
    }
    if (direction === "stable") {
      if (metric === "unknown") return unresolvedModelSemantic(value, "The model did not identify a metric for the stability claim.");
      return { ...value, magnitude: ["none", "subtle", "unknown"].includes(magnitude) ? magnitude : "none" };
    }
    if (metric === "unknown" ||
        (metric === "visual_stability" && ["increased", "decreased"].includes(direction))) {
      return unresolvedModelSemantic(value, "The model metric and direction were inconsistent.");
    }
    if (["increased", "decreased", "mixed"].includes(direction) &&
        !["subtle", "moderate", "pronounced"].includes(magnitude)) {
      return unresolvedModelSemantic(value, "The model output did not establish a visible-change magnitude.");
    }
    return value;
  });
}

function unresolvedModelSemantic(value, limitation) {
  return {
    ...value,
    metric: "unknown",
    direction: "unknown",
    magnitude: "unknown",
    confidence: "low",
    limitations: [...(value?.limitations ?? []), limitation],
  };
}

export function validateStructuredPhotoSemantic(value = {}) {
  if (!PHOTO_INTERPRETATION_METRICS.includes(value.metric)) {
    throw new Error(`Unsupported Photo interpretation metric: ${value.metric}`);
  }
  if (!PHOTO_INTERPRETATION_DIRECTIONS.includes(value.direction)) {
    throw new Error(`Unsupported Photo interpretation direction: ${value.direction}`);
  }
  if (!PHOTO_INTERPRETATION_MAGNITUDES.includes(value.magnitude)) {
    throw new Error(`Unsupported Photo interpretation magnitude: ${value.magnitude}`);
  }
  if (value.direction === "insufficient" && !value.limitations?.length) {
    throw new Error("Insufficient Photo interpretation requires a limitation.");
  }
  if (value.direction === "stable" && !["none", "subtle", "unknown"].includes(value.magnitude)) {
    throw new Error("Stable Photo interpretation cannot carry a meaningful-change magnitude.");
  }
  if (["increased", "decreased", "mixed"].includes(value.direction) &&
      !["subtle", "moderate", "pronounced"].includes(value.magnitude)) {
    throw new Error("Directional Photo interpretation requires a visible-change magnitude.");
  }
  if (["insufficient", "unknown"].includes(value.direction) && value.magnitude !== "unknown") {
    throw new Error("Unresolved Photo interpretation must use unknown magnitude.");
  }
  if (
    value.metric === "unknown" &&
    !["unknown", "insufficient"].includes(value.direction)
  ) {
    throw new Error("Unknown Photo metric cannot carry a directional conclusion.");
  }
  if (
    value.metric === "visual_stability" &&
    !["stable", "mixed", "insufficient", "unknown"].includes(value.direction)
  ) {
    throw new Error("Visual stability cannot use an increasing or decreasing direction.");
  }
  if (
    value.bodyFatPercentage != null ||
    value.leanMass != null ||
    value.fatMass != null ||
    value.numericBodyCompositionValue != null
  ) {
    throw new Error("Photo interpretation cannot contain numeric body-composition measurements.");
  }
  if (PRECISE_BODY_COMPOSITION_PATTERN.test(String(value.change ?? ""))) {
    throw new Error("Photo interpretation cannot state precise body-composition measurements.");
  }
}

export function normalizePhotoInterpretationToStructuredObservations(interpretation = {}) {
  const observations = [];

  addObservationGroup({
    observations,
    values: interpretation.briefing_summary?.biggest_changes,
    confidence: "moderate",
    importance: "high",
    type: "briefing_observation",
  });
  addObservationGroup({
    observations,
    values: interpretation.silhouette_observations,
    confidence: "moderate",
    importance: "high",
    type: "silhouette",
  });
  addObservationGroup({
    observations,
    values: interpretation.conditioning_observations,
    confidence: "moderate",
    importance: "high",
    type: "conditioning",
  });
  addObservationGroup({
    observations,
    values: interpretation.ratio_observations,
    confidence: "moderate",
    importance: "high",
    type: "proportion",
  });
  addObservationGroup({
    observations,
    values: interpretation.high_confidence_observations,
    confidence: "high",
    importance: "high",
    type: "high_confidence",
  });
  addObservationGroup({
    observations,
    values: interpretation.emerging_evidence,
    confidence: "moderate",
    importance: "medium",
    type: "emerging_evidence",
  });
  addObservationGroup({
    observations,
    values: interpretation.uncertain_or_limited_observations,
    confidence: "low",
    importance: "limitation",
    type: "limitation",
    supportsGoal: false,
  });

  for (const entry of interpretation.observation_confidence ?? []) {
    observations.push({
      change: entry.observation,
      confidence: entry.confidence,
      importance: entry.meaningful_change_supported ? "high" : "medium",
      limitations: entry.basis ? [entry.basis] : [],
      region: inferPhotoObservationRegion(entry.observation),
      supportsGoal: Boolean(entry.meaningful_change_supported),
      type: "confidence_observation",
    });
  }

  for (const section of interpretation.detailed_interpretation?.sections ?? []) {
    observations.push({
      change: section.what_changed,
      confidence: section.confidence ?? "moderate",
      importance: section.status === "improved" ? "high" : "medium",
      limitations: [section.what_cannot_be_determined, section.confidence_note].filter(Boolean),
      region: section.region ?? inferPhotoObservationRegion(section.what_changed),
      supportsGoal: section.status !== "not_visible",
      type: "regional_review",
      unchanged: section.what_did_not_change,
      why: section.why_it_matters ?? section.why,
    });
  }

  return uniqueObservationObjects(observations).slice(0, 24);
}

function normalizeConfidence(value) {
  const confidence = String(value ?? "low").toLowerCase();
  return ["high", "moderate", "low", "unknown"].includes(confidence)
    ? confidence
    : "unknown";
}

function normalizeStringList(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(String).filter(Boolean))].sort();
}

export function inferPhotoObservationRegion(value = "") {
  const text = String(value).toLowerCase();
  if (/shoulder-to-waist|ratio|proportion|v-taper|taper/.test(text)) {
    return "Proportions";
  }
  if (/waist|lower abdomen|midsection|torso|ab|oblique|linea alba/.test(text)) {
    return "Midsection";
  }
  if (/chest|pec/.test(text)) return "Chest";
  if (/shoulder|arm|upper body|triceps|biceps/.test(text)) return "Upper body";
  if (/back|lat|trap|rear delt/.test(text)) return "Back";
  if (/conditioning|leaner|silhouette|shape|softness/.test(text)) {
    return "Overall physique";
  }
  if (/weight|scale|weigh/.test(text)) return "Weight trend";

  return "Photo evidence";
}

function addObservationGroup({
  confidence,
  importance,
  observations,
  supportsGoal = true,
  type,
  values,
}) {
  for (const value of values ?? []) {
    observations.push({
      change: value,
      confidence,
      importance,
      limitations: [],
      region: inferPhotoObservationRegion(value),
      supportsGoal,
      type,
    });
  }
}

function uniqueObservationObjects(observations) {
  const seen = new Set();

  return observations.filter((observation) => {
    const key = `${observation.region}:${normalizeForComparison(observation.change)}`;
    if (!observation.change || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeForComparison(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
