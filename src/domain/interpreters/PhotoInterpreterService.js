const DEFAULT_MODEL = "gpt-4.1-mini";

export async function interpretPhotoSetWithVision({
  captureDate = null,
  goalContext = "Visible Abs at Rest",
  photoSetId = `photo_set_${Date.now()}`,
  photos = [],
  previousPhotoSet = null,
} = {}) {
  const normalizedPhotos = photos.map(normalizePhotoInput);
  const normalizedPrevious = previousPhotoSet
    ? {
        ...previousPhotoSet,
        photos: (previousPhotoSet.photos ?? []).map(normalizePhotoInput),
      }
    : null;

  if (!process.env.OPENAI_API_KEY) {
    return {
      provider: "fallback",
      warning:
        "OPENAI_API_KEY is not configured. Showing deterministic Founder Alpha photo interpretation fallback.",
      interpretation: createFallbackPhotoInterpretation({
        captureDate,
        goalContext,
        photoSetId,
        photos: normalizedPhotos,
        previousPhotoSet: normalizedPrevious,
      }),
    };
  }

  try {
    const interpretation = await callOpenAIPhotoInterpreter({
      captureDate,
      goalContext,
      photoSetId,
      photos: normalizedPhotos,
      previousPhotoSet: normalizedPrevious,
    });

    return {
      provider: "openai",
      warning: null,
      interpretation: normalizeInterpreterOutput(interpretation, {
        captureDate,
        photoSetId,
        photos: normalizedPhotos,
      }),
    };
  } catch (error) {
    return {
      provider: "fallback",
      warning: `OpenAI photo interpretation failed. Showing deterministic fallback. ${error.message}`,
      interpretation: createFallbackPhotoInterpretation({
        captureDate,
        goalContext,
        photoSetId,
        photos: normalizedPhotos,
        previousPhotoSet: normalizedPrevious,
      }),
    };
  }
}

async function callOpenAIPhotoInterpreter({
  captureDate,
  goalContext,
  photoSetId,
  photos,
  previousPhotoSet,
}) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_PHOTO_INTERPRETER_MODEL || DEFAULT_MODEL,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: getSystemPrompt(),
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: getUserPrompt({
                captureDate,
                goalContext,
                photoSetId,
                photos,
                previousPhotoSet,
              }),
            },
            ...photos
              .filter((photo) => photo.dataUrl)
              .map((photo) => ({
                type: "input_image",
                image_url: photo.dataUrl,
              })),
            ...((previousPhotoSet?.photos ?? [])
              .filter((photo) => photo.dataUrl)
              .map((photo) => ({
                type: "input_image",
                image_url: photo.dataUrl,
              }))),
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "physiqueos_photo_interpretation",
          strict: true,
          schema: photoInterpretationJsonSchema,
        },
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Responses API returned ${response.status}: ${detail.slice(0, 240)}`);
  }

  const payload = await response.json();
  const outputText = getOutputText(payload);

  if (!outputText) {
    throw new Error("Responses API did not return JSON text.");
  }

  return JSON.parse(outputText);
}

function getSystemPrompt() {
  return [
    "You are PhysiqueOS PhotoInterpreter.",
    "Return structured JSON only.",
    "Interpret progress photos as evidence toward the user's stated goal.",
    "Do not identify medical conditions, body shame, or overstate certainty.",
    "Do not estimate exact body-fat percentage unless framed as low-confidence visual estimate.",
    "Compare only matching views when available: front-to-front, side-to-side, back-to-back.",
    "Do not hallucinate missing views.",
    "Do not call the user healthy, unhealthy, client, patient, or subject.",
    "Do not recommend flexed photos for a relaxed-at-rest goal unless clearly labeled optional; prefer standard comparable front, side, and back relaxed evidence.",
    "Do not recommend generic core work from visual evidence alone.",
    "Use PhysiqueOS voice: calm, evidence-first, goal-oriented, concise, and practical.",
    "Always state limitations from lighting, pose, angle, distance, pump, tan, clothing, or flexing when relevant.",
    "Tie observations to goal achievement, evidence quality, next evidence, and next best step.",
  ].join(" ");
}

function getUserPrompt({ captureDate, goalContext, photoSetId, photos, previousPhotoSet }) {
  return JSON.stringify(
    {
      task: "Analyze the current progress photo set and compare against the previous set when matching views are available.",
      product_philosophy: {
        evidence_role: "Photos are visual evidence, not measurements.",
        goal_first: "Tie interpretation back to goal achievement.",
        certainty: "Prefer visual trend and evidence quality over exact measurements.",
      },
      requested_schema: Object.keys(photoInterpretationJsonSchema.properties),
      current_photo_set: {
        photo_set_id: photoSetId,
        capture_date: captureDate,
        goal_context: goalContext,
        photos: photos.map(stripImageData),
      },
      previous_photo_set: previousPhotoSet
        ? {
            ...previousPhotoSet,
            photos: (previousPhotoSet.photos ?? []).map(stripImageData),
          }
        : null,
    },
    null,
    2
  );
}

function createFallbackPhotoInterpretation({
  captureDate,
  goalContext,
  photoSetId,
  photos,
  previousPhotoSet,
}) {
  const views = getViewsDetected(photos);
  const hasPrevious = Boolean(previousPhotoSet?.photos?.length);
  const matchingViews = hasPrevious
    ? views.filter((view) =>
        previousPhotoSet.photos.some((photo) => photo.view === view)
      )
    : [];

  return {
    photo_set_id: photoSetId,
    capture_date: captureDate,
    views_detected: views,
    body_composition_observations: [
      "Progress photos were stored as structured visual evidence.",
      hasPrevious
        ? `Matching comparison views available: ${matchingViews.join(", ") || "none"}.`
        : "This set establishes a visual baseline for future comparison.",
    ],
    visual_changes_observed: hasPrevious
      ? matchingViews.map((view) => `${formatLabel(view)} view is available for same-view comparison.`)
      : ["No prior matching photo set was supplied, so no visual change is claimed."],
    likely_improving_areas:
      goalContext.toLowerCase().includes("abs") && views.includes("front")
        ? ["Front relaxed view can support visible-ab trend review once compared over time."]
        : ["Comparable capture conditions can improve visual trend confidence over time."],
    likely_lagging_areas:
      goalContext.toLowerCase().includes("abs")
        ? ["Lower-abdominal definition should remain a specific visual focus if visible abs are the goal."]
        : ["Lagging areas should be identified only after repeated comparable photo sets."],
    symmetry_balance_notes: [
      views.includes("back")
        ? "Rear views can support symmetry and lean-mass appearance review."
        : "Back view was not detected, so rear symmetry is not assessed.",
    ],
    goal_relevance: [
      `Relevant to ${goalContext}.`,
      "Photos support qualitative visual confidence but do not replace DEXA or scale evidence.",
    ],
    confidence_notes: [
      "Fallback interpretation uses metadata and product rules, not computer vision.",
      "Confidence improves when matching views are captured under consistent conditions.",
    ],
    limitations: [
      "OPENAI_API_KEY is missing or unavailable, so no vision model inspected the image pixels.",
      hasPrevious
        ? "Only matching views should be compared."
        : "No previous set was available for visual comparison.",
      "Lighting, pose, distance, clothing, pump, tan, and flexing can affect interpretation.",
    ],
    suggested_evidence: [
      "Capture the same views under the same conditions next week.",
      "Pair photo sets with same-day morning weight when possible.",
    ],
    suggested_protocols: [
      "Weekly comparable progress photos",
      "Maintain default morning, fasted photo context",
    ],
    suggested_priorities: [
      "Save this photo set as evidence",
      "Review the next matching photo set before changing course",
    ],
    user_facing_summary: hasPrevious
      ? "Photo evidence is ready for same-view comparison, but the fallback path will not claim visual changes without model review."
      : "Photo evidence saved. This creates a baseline for future visual comparison.",
    coach_briefing_insert:
      "Progress photos now add visual context for the goal. Treat them as supporting evidence alongside weight and DEXA, and keep future captures consistent to improve confidence.",
  };
}

function normalizeInterpreterOutput(output, fallback) {
  return {
    ...createFallbackPhotoInterpretation({
      captureDate: fallback.captureDate,
      photoSetId: fallback.photoSetId,
      photos: fallback.photos,
      goalContext: "Visible Abs at Rest",
      previousPhotoSet: null,
    }),
    ...output,
    photo_set_id: output.photo_set_id || fallback.photoSetId,
    capture_date: output.capture_date || fallback.captureDate,
    views_detected: output.views_detected?.length
      ? output.views_detected
      : getViewsDetected(fallback.photos),
  };
}

function getOutputText(payload) {
  if (payload.output_text) return payload.output_text;

  return payload.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => content.text ?? "")
    .join("")
    .trim();
}

function normalizePhotoInput(photo) {
  return {
    fileName: photo.fileName ?? photo.name ?? "",
    dataUrl: photo.dataUrl ?? null,
    mimeType: photo.mimeType ?? "image/jpeg",
    view: normalizeView(photo.view),
    pose: photo.pose ?? "unknown",
    capturedAt: photo.capturedAt ?? photo.date ?? null,
    conditions: photo.conditions ?? {},
  };
}

function stripImageData(photo) {
  const { dataUrl, ...metadata } = photo;

  return {
    ...metadata,
    hasImageInput: Boolean(dataUrl),
  };
}

function getViewsDetected(photos) {
  const views = [...new Set(photos.map((photo) => normalizeView(photo.view)))].filter(Boolean);

  return views.length > 0 ? views : ["unknown"];
}

function normalizeView(view) {
  const normalized = String(view ?? "unknown").toLowerCase();

  if (["front", "side", "back"].includes(normalized)) return normalized;
  if (normalized === "rear") return "back";

  return "unknown";
}

function formatLabel(value) {
  return String(value ?? "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const stringArray = {
  type: "array",
  items: { type: "string" },
};

export const photoInterpretationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "photo_set_id",
    "capture_date",
    "views_detected",
    "body_composition_observations",
    "visual_changes_observed",
    "likely_improving_areas",
    "likely_lagging_areas",
    "symmetry_balance_notes",
    "goal_relevance",
    "confidence_notes",
    "limitations",
    "suggested_evidence",
    "suggested_protocols",
    "suggested_priorities",
    "user_facing_summary",
    "coach_briefing_insert",
  ],
  properties: {
    photo_set_id: { type: "string" },
    capture_date: { type: ["string", "null"] },
    views_detected: {
      type: "array",
      items: { enum: ["front", "side", "back", "unknown"], type: "string" },
    },
    body_composition_observations: stringArray,
    visual_changes_observed: stringArray,
    likely_improving_areas: stringArray,
    likely_lagging_areas: stringArray,
    symmetry_balance_notes: stringArray,
    goal_relevance: stringArray,
    confidence_notes: stringArray,
    limitations: stringArray,
    suggested_evidence: stringArray,
    suggested_protocols: stringArray,
    suggested_priorities: stringArray,
    user_facing_summary: { type: "string" },
    coach_briefing_insert: { type: "string" },
  },
};
