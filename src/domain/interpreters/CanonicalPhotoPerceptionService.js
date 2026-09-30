import {
  PHOTO_INTERPRETATION_DIRECTIONS,
  PHOTO_INTERPRETATION_MAGNITUDES,
  PHOTO_INTERPRETATION_METRICS,
  normalizeStructuredPhotoSemantics,
} from "./PhotoObservationModel.js";

export const CANONICAL_PHOTO_PERCEPTION_VERSION = "canonical_photo_perception_v1";
export const CANONICAL_PHOTO_PERCEPTION_PROMPT_VERSION =
  "canonical_photo_perception_goal_blind_v1";
export const PHOTO_ONLY_CONTEXT_BOUNDARY =
  "goal_phase_strategy_and_non_photo_evidence_excluded_from_model_input";

const DEFAULT_MODEL = "gpt-4.1-mini";
const COMPARABILITY = ["high", "good", "moderate", "limited", "insufficient"];
const RELIABILITY = ["high", "moderate", "low", "insufficient"];

/**
 * Prospective source-analysis producer. Its API deliberately has no Goal,
 * phase, guardrail, strategy, DEXA, weight, training, nutrition, activity, or
 * sleep input. Goal interpretation is a separate pure function below.
 */
export async function interpretCanonicalPhotoPerceptionWithVision({
  captureDate = null,
  photoSetId,
  photos = [],
  previousPhotoSet = null,
  fetchImpl = globalThis.fetch,
  model = process.env.OPENAI_PHOTO_INTERPRETER_MODEL || DEFAULT_MODEL,
  apiKey = process.env.OPENAI_API_KEY,
} = {}) {
  if (!apiKey) throw new Error("Canonical Photo Perception requires OPENAI_API_KEY.");
  if (typeof fetchImpl !== "function") throw new Error("Canonical Photo Perception requires fetch.");
  const current = photos.map(normalizePhotoInput);
  const previous = previousPhotoSet
    ? { ...previousPhotoSet, photos: (previousPhotoSet.photos ?? []).map(normalizePhotoInput) }
    : null;
  if (!current.length || !current.some((photo) => photo.dataUrl)) {
    throw new Error("Canonical Photo Perception requires current image bytes.");
  }

  const comparisonMetadata = createComparisonMetadata({ captureDate, photos: current, previousPhotoSet: previous });
  const response = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      max_output_tokens: 2500,
      input: [
        { role: "system", content: [{ type: "input_text", text: getCanonicalPhotoPerceptionSystemPrompt() }] },
        {
          role: "user",
          content: [
            { type: "input_text", text: getCanonicalPhotoPerceptionUserPrompt({ captureDate, photoSetId, photos: current, previousPhotoSet: previous, comparisonMetadata }) },
            ...current.filter((photo) => photo.dataUrl).map((photo) => ({ type: "input_image", image_url: photo.dataUrl })),
            ...(previous?.photos ?? []).filter((photo) => photo.dataUrl).map((photo) => ({ type: "input_image", image_url: photo.dataUrl })),
          ],
        },
      ],
      text: { format: { type: "json_schema", name: "canonical_photo_perception", strict: true, schema: canonicalPhotoPerceptionJsonSchema } },
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Responses API returned ${response.status}: ${detail.slice(0, 240)}`);
  }
  const payload = await response.json();
  const outputText = getOutputText(payload);
  if (!outputText) throw new Error("Responses API did not return canonical perception JSON.");
  return normalizeCanonicalPhotoPerception(JSON.parse(outputText), {
    captureDate,
    photoSetId,
    model,
    comparisonMetadata,
  });
}

export function getCanonicalPhotoPerceptionSystemPrompt() {
  return [
    "You are a goal-blind longitudinal progress-photo perception system.",
    "Return structured JSON only.",
    "Use only the supplied image bytes and photo metadata.",
    "Do not infer, request, or optimize for any Goal, phase, strategy, guardrail, desired outcome, measurement, training, nutrition, activity, sleep, or health context.",
    "Evaluate visual leanness, abdominal definition, whole-body softness, muscularity or fullness, and visual stability symmetrically. No metric is preferred.",
    "For every observation reason in this order: observation-specific comparability, visible magnitude, direction only when magnitude exists, then confidence.",
    "Comparability is claim-specific. Framing and geometric scale can limit width, taper, silhouette, and size claims without preventing a broad stability or no-obvious-deterioration observation. Lighting can limit subtle definition claims. Arm, torso, and scapular position can limit regional size claims.",
    "As the apparent difference becomes smaller, capture differences must have more influence on confidence.",
    "Stable, no obvious deterioration, and insufficient directional evidence are valuable results. Never manufacture improvement.",
    "A stable direction normally has magnitude none. Directional observations require subtle, moderate, or pronounced magnitude.",
    "Do not estimate body-fat percentage, fat mass, lean mass, muscle gained, or any other numeric body-composition value.",
    "Do not state what plan should change, whether evidence supports a trajectory, or why an observation matters for a Goal.",
    "Do not infer elapsed time from the images; use only supplied dates and days elapsed.",
  ].join(" ");
}

export function getCanonicalPhotoPerceptionUserPrompt({
  captureDate,
  photoSetId,
  photos,
  previousPhotoSet,
  comparisonMetadata,
}) {
  return JSON.stringify({
    task: "Compare like-for-like current and prior progress photos as visual evidence only.",
    context_boundary: PHOTO_ONLY_CONTEXT_BOUNDARY,
    photo_set_id: photoSetId,
    capture_date: captureDate,
    comparison_metadata: comparisonMetadata,
    current_photos: photos.map((photo) => stripImageData(normalizePhotoInput(photo))),
    previous_photo_set: previousPhotoSet
      ? {
        photoSetId: previousPhotoSet.photoSetId ?? null,
        captureDate: previousPhotoSet.captureDate ?? null,
        photos: (previousPhotoSet.photos ?? [])
          .map((photo) => stripImageData(normalizePhotoInput(photo))),
      }
      : null,
    required_order: [
      "classify source view and pose",
      "assess global capture comparability dimensions",
      "assess comparability separately for every proposed observation",
      "choose visible magnitude",
      "choose direction only if magnitude supports it",
      "choose confidence and list confounders",
      "summarize the photo-only result, including stability where appropriate",
    ],
  }, null, 2);
}

export function normalizeCanonicalPhotoPerception(output, {
  captureDate,
  photoSetId,
  model,
  comparisonMetadata,
} = {}) {
  const observations = normalizeStructuredPhotoSemantics(
    (output.observations ?? []).map((item) => ({
      region: item.region,
      metric: item.metric,
      direction: item.direction,
      magnitude: item.magnitude,
      change: item.change,
      confidence: item.confidence,
      limitations: item.confounders,
      pose: output.source_classification?.current_pose ?? "unknown",
      bodyView: output.source_classification?.current_view ?? "unknown",
      contractionState: output.source_classification?.current_pose ?? "unknown",
      comparisonSessionId: null,
      sourceEvidenceIds: [],
      provenance: {
        interpreter: "canonical_photo_perception_service",
        interpreterVersion: CANONICAL_PHOTO_PERCEPTION_VERSION,
      },
    })),
    { provenance: { promptPolicyVersion: CANONICAL_PHOTO_PERCEPTION_PROMPT_VERSION } },
  ).map((normalized, index) => ({
    ...normalized,
    observationId: String(output.observations?.[index]?.observation_id ?? `observation_${index + 1}`),
    comparability: normalizeObservationComparability(output.observations?.[index]?.comparability),
  }));
  const result = {
    schemaVersion: CANONICAL_PHOTO_PERCEPTION_VERSION,
    photoSetId: String(output.photo_set_id ?? photoSetId ?? ""),
    captureDate: output.capture_date ?? captureDate ?? null,
    comparisonMetadata: structuredClone(output.comparison_metadata ?? comparisonMetadata ?? {}),
    sourceClassification: structuredClone(output.source_classification ?? {}),
    captureComparability: normalizeCaptureComparability(output.capture_comparability),
    observations,
    dominantVisualStory: String(output.dominant_visual_story ?? ""),
    overallPhotoOnlyMagnitude: normalizeMagnitude(output.overall_photo_only_magnitude),
    photoOnlyReliability: normalizeReliability(output.photo_only_reliability),
    confounders: uniqueStrings(output.confounders),
    provenance: {
      producer: "canonical_photo_perception_service",
      producerVersion: CANONICAL_PHOTO_PERCEPTION_VERSION,
      model: String(model ?? DEFAULT_MODEL),
      promptPolicyVersion: CANONICAL_PHOTO_PERCEPTION_PROMPT_VERSION,
      contextBoundary: PHOTO_ONLY_CONTEXT_BOUNDARY,
      goalContextUsed: false,
      nonPhotoEvidenceUsed: false,
      legacyGoalAwareSourceAccepted: false,
    },
  };
  assertProspectivePhotoPerceptionSource(result);
  return deepFreeze(result);
}

export function assertProspectivePhotoPerceptionSource(perception) {
  const provenance = perception?.provenance ?? {};
  if (
    perception?.schemaVersion !== CANONICAL_PHOTO_PERCEPTION_VERSION ||
    provenance.producer !== "canonical_photo_perception_service" ||
    provenance.promptPolicyVersion !== CANONICAL_PHOTO_PERCEPTION_PROMPT_VERSION ||
    provenance.contextBoundary !== PHOTO_ONLY_CONTEXT_BOUNDARY ||
    provenance.goalContextUsed !== false ||
    provenance.nonPhotoEvidenceUsed !== false ||
    provenance.legacyGoalAwareSourceAccepted !== false
  ) {
    throw Object.assign(
      new Error("Prospective canonical Photo Intelligence rejects unverified or legacy goal-aware source analysis."),
      { code: "PHOTO_PERCEPTION_SOURCE_CONTAMINATED" },
    );
  }
  return true;
}

/** Goal context enters only after perception is frozen. */
export function interpretFrozenPhotoPerceptionForGoal(perception, goalContext = null) {
  assertProspectivePhotoPerceptionSource(perception);
  const original = JSON.stringify(perception);
  const goalTitle = String(goalContext?.activeGoal?.title ?? goalContext?.title ?? "").trim();
  if (!goalTitle) return deepFreeze({ direction: "goal_blind", relevance: [], interpretation: perception.dominantVisualStory });
  const build = /build.*(?:lean )?mass|muscle|hypertrophy|lean gain/i.test(goalTitle);
  const waist = perception.observations.filter((item) => /waist|midsection|abdom|torso/i.test(`${item.region} ${item.change}`));
  const muscle = perception.observations.filter((item) => item.metric === "muscularity");
  const waistWorse = waist.some((item) =>
    (item.metric === "whole_body_softness" && item.direction === "increased") ||
    (item.metric === "leanness" && item.direction === "decreased"));
  const waistLeaner = waist.some((item) =>
    (item.metric === "whole_body_softness" && item.direction === "decreased") ||
    (item.metric === "leanness" && item.direction === "increased") ||
    (item.metric === "abdominal_definition" && item.direction === "increased"));
  const waistStable = waist.some((item) => item.direction === "stable");
  const muscleUp = muscle.some((item) => item.direction === "increased");
  const muscleStable = muscle.some((item) => item.direction === "stable");
  let direction = "uncertain";
  let interpretation;
  if (build) {
    direction = muscleUp && !waistWorse ? "supportive" :
      muscleUp && waistWorse ? "mixed" : muscleStable && !waistWorse ? "neutral" : "uncertain";
    interpretation = muscleUp && waistStable
      ? "Upper-body fullness with a stable waist is visually supportive of the build."
      : muscleUp && waistWorse
        ? "Muscularity increased, while increased waist softness makes the photo evidence mixed for the build."
        : muscleStable && waistLeaner
          ? "Muscularity appears stable while the waist looks leaner; the photos do not show a clear build signal."
          : "The photo evidence does not establish a clear build direction.";
  } else {
    direction = waistLeaner ? "supportive" : waistWorse ? "counter_directional" : "neutral";
    interpretation = waistStable
      ? "Leanness appears maintained, with limited further visual fat-loss progress."
      : waistLeaner
        ? "The waist appears visually leaner while muscularity is maintained."
        : waistWorse
          ? "Increased waist softness is counter-directional for visible abdominal definition."
          : "The photo evidence does not establish a clear leanness direction.";
  }
  if (JSON.stringify(perception) !== original) throw new Error("Goal interpretation mutated canonical perception.");
  return deepFreeze({
    goalTitle,
    direction,
    relevance: build ? ["muscularity", "waist stability", "softness guardrail"] : ["leanness", "abdominal definition", "waist softness"],
    interpretation,
    perceptionFingerprint: stablePerceptionProjection(perception),
  });
}

export function stablePerceptionProjection(perception) {
  return JSON.stringify({
    sourceClassification: perception.sourceClassification,
    captureComparability: perception.captureComparability,
    observations: perception.observations,
    dominantVisualStory: perception.dominantVisualStory,
    overallPhotoOnlyMagnitude: perception.overallPhotoOnlyMagnitude,
    photoOnlyReliability: perception.photoOnlyReliability,
    confounders: perception.confounders,
  });
}

function normalizePhotoInput(photo = {}) {
  return {
    fileName: String(photo.fileName ?? "photo"),
    dataUrl: photo.dataUrl ?? null,
    view: normalizeView(photo.view),
    pose: normalizePose(photo.pose),
    capturedAt: photo.capturedAt ?? null,
    // Conditions are an explicit allow-list of capture facts. Free-form notes
    // can contain Goal or strategy language and must not cross the boundary.
    conditions: normalizePhotoConditions(photo.conditions),
  };
}

function normalizePhotoConditions(value = {}) {
  const allowed = [
    "morning", "fasted", "postWorkout", "pump", "sameLighting", "lighting",
    "location", "timeOfDay", "cameraDistance", "framing", "angle", "clothing",
    "editing",
  ];
  return Object.fromEntries(allowed
    .filter((key) => ["boolean", "string", "number"].includes(typeof value?.[key]))
    .map((key) => [key, value[key]]));
}

function stripImageData({ dataUrl: _dataUrl, ...photo }) { return photo; }

function createComparisonMetadata({ captureDate, photos, previousPhotoSet }) {
  const previousDate = previousPhotoSet?.captureDate ?? null;
  const current = photos[0] ?? {};
  const previous = previousPhotoSet?.photos?.[0] ?? {};
  const exact = Boolean(previousPhotoSet?.photos?.length) &&
    current.view === previous.view && current.pose === previous.pose;
  return {
    current_capture_date: captureDate,
    previous_capture_date: previousDate,
    days_elapsed: dateDifference(previousDate, captureDate),
    current_view: current.view,
    current_pose: current.pose,
    previous_view: previous.view ?? "unknown",
    previous_pose: previous.pose ?? "unknown",
    match_status: exact ? "exact_match" : previousPhotoSet ? "mismatch" : "baseline",
  };
}

function dateDifference(start, end) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(start ?? "")) || !/^\d{4}-\d{2}-\d{2}$/.test(String(end ?? ""))) return null;
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000);
}

function normalizeView(value) {
  const text = String(value ?? "unknown").toLowerCase();
  if (/front/.test(text)) return "front";
  if (/back|rear/.test(text)) return "back";
  if (/side|profile/.test(text)) return "side";
  return "unknown";
}

function normalizePose(value) {
  const text = String(value ?? "unknown").toLowerCase();
  if (/flex/.test(text)) return "flexed";
  if (/relax/.test(text)) return "relaxed";
  return "unknown";
}

function normalizeObservationComparability(value = {}) {
  return {
    rating: COMPARABILITY.includes(value.rating) ? value.rating : "insufficient",
    applicableClaims: uniqueStrings(value.applicable_claims ?? value.applicableClaims),
    compromisedClaims: uniqueStrings(value.compromised_claims ?? value.compromisedClaims),
    rationale: String(value.rationale ?? ""),
  };
}

function normalizeCaptureComparability(value = {}) {
  return {
    overall: COMPARABILITY.includes(value.overall) ? value.overall : "insufficient",
    dimensions: (value.dimensions ?? []).map((item) => ({
      dimension: String(item.dimension ?? "unknown"),
      rating: COMPARABILITY.includes(item.rating) ? item.rating : "insufficient",
      reason: String(item.reason ?? ""),
    })),
    confounders: uniqueStrings(value.confounders),
  };
}

function normalizeMagnitude(value) {
  return PHOTO_INTERPRETATION_MAGNITUDES.includes(value) ? value : "unknown";
}

function normalizeReliability(value) { return RELIABILITY.includes(value) ? value : "insufficient"; }
function uniqueStrings(values) { return [...new Set((Array.isArray(values) ? values : []).map(String).filter(Boolean))].sort(); }

function getOutputText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  for (const item of payload?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (typeof content?.text === "string") return content.text;
    }
  }
  return null;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

const stringArray = { type: "array", items: { type: "string" } };
const comparabilityRating = { type: "string", enum: COMPARABILITY };

export const canonicalPhotoPerceptionJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "photo_set_id", "capture_date", "comparison_metadata", "source_classification",
    "capture_comparability", "observations", "dominant_visual_story",
    "overall_photo_only_magnitude", "photo_only_reliability", "confounders",
  ],
  properties: {
    photo_set_id: { type: "string" },
    capture_date: { type: ["string", "null"] },
    comparison_metadata: {
      type: "object", additionalProperties: false,
      required: ["current_capture_date", "previous_capture_date", "days_elapsed", "current_view", "current_pose", "previous_view", "previous_pose", "match_status"],
      properties: {
        current_capture_date: { type: ["string", "null"] }, previous_capture_date: { type: ["string", "null"] },
        days_elapsed: { type: ["number", "null"] }, current_view: { type: "string" }, current_pose: { type: "string" },
        previous_view: { type: "string" }, previous_pose: { type: "string" }, match_status: { type: "string" },
      },
    },
    source_classification: {
      type: "object", additionalProperties: false,
      required: ["current_view", "current_pose", "previous_view", "previous_pose"],
      properties: { current_view: { type: "string" }, current_pose: { type: "string" }, previous_view: { type: "string" }, previous_pose: { type: "string" } },
    },
    capture_comparability: {
      type: "object", additionalProperties: false,
      required: ["overall", "dimensions", "confounders"],
      properties: {
        overall: comparabilityRating,
        dimensions: { type: "array", items: { type: "object", additionalProperties: false, required: ["dimension", "rating", "reason"], properties: { dimension: { type: "string" }, rating: comparabilityRating, reason: { type: "string" } } } },
        confounders: stringArray,
      },
    },
    observations: {
      type: "array", minItems: 1,
      items: {
        type: "object", additionalProperties: false,
        required: ["observation_id", "region", "metric", "direction", "magnitude", "confidence", "change", "confounders", "comparability"],
        properties: {
          observation_id: { type: "string" }, region: { type: "string" },
          metric: { type: "string", enum: PHOTO_INTERPRETATION_METRICS },
          direction: { type: "string", enum: PHOTO_INTERPRETATION_DIRECTIONS },
          magnitude: { type: "string", enum: PHOTO_INTERPRETATION_MAGNITUDES },
          confidence: { type: "string", enum: ["high", "moderate", "low", "unknown"] },
          change: { type: "string" }, confounders: stringArray,
          comparability: {
            type: "object", additionalProperties: false,
            required: ["rating", "applicable_claims", "compromised_claims", "rationale"],
            properties: { rating: comparabilityRating, applicable_claims: stringArray, compromised_claims: stringArray, rationale: { type: "string" } },
          },
        },
      },
    },
    dominant_visual_story: { type: "string" },
    overall_photo_only_magnitude: { type: "string", enum: PHOTO_INTERPRETATION_MAGNITUDES },
    photo_only_reliability: { type: "string", enum: RELIABILITY },
    confounders: stringArray,
  },
};
