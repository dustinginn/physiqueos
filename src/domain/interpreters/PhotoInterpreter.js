import {
  createVisualEvidence,
  VisualEvidenceSourceType,
} from "./VisualEvidence";
import {
  getProgressPhotoCategoryLabel,
  normalizeProgressPhotoCategory,
} from "../models/progressPhotoPoseVocabulary";

export function interpretProgressPhotos({ photos = [], weights = [] } = {}) {
  const sortedPhotos = [...photos].sort((a, b) =>
    getPhotoDate(a).localeCompare(getPhotoDate(b))
  );

  return sortedPhotos.map((photo) => {
    const normalizedPhoto = normalizeProgressPhoto(photo);
    const previousPhoto = getPreviousMatchingPhoto(normalizedPhoto, sortedPhotos);
    const dateKey = getDateKey(getPhotoDate(photo));
    const sameDayWeight = weights.find((entry) => getDateKey(entry.measuredAt) === dateKey);

    return createVisualEvidence({
      id: `visual-${photo.id}`,
      sourceId: photo.id,
      sourceType: VisualEvidenceSourceType.PROGRESS_PHOTO,
      imageRef: photo.imagePath ?? "",
      evidenceDate: getPhotoDate(photo),
      uploadDate: photo.uploadedAt ?? null,
      viewType: normalizedPhoto.view,
      capturedAt: getPhotoDate(photo),
      uploadedAt: photo.uploadedAt ?? null,
      imagePath: photo.imagePath ?? "",
      view: normalizedPhoto.view,
      pose: normalizedPhoto.pose,
      tags: getKnownPhotoTags(normalizedPhoto),
      relatedGoals: photo.relatedGoalIds ?? [],
      relatedGoalIds: photo.relatedGoalIds ?? [],
      comparisonTarget: previousPhoto
        ? {
            sourceId: previousPhoto.id,
            capturedAt: getPhotoDate(previousPhoto),
            imagePath: previousPhoto.imagePath ?? "",
            label: getPhotoLabel(previousPhoto),
          }
        : null,
      observations: getPhotoObservations(normalizedPhoto, previousPhoto),
      biggestImprovements: getPhotoStrengths(normalizedPhoto, previousPhoto),
      remainingFocus: getPhotoRemainingFocus(normalizedPhoto),
      confidenceImpact: getPhotoConfidenceImpact(normalizedPhoto),
      limitations: getPhotoLimitations(normalizedPhoto, previousPhoto),
      extractionConfidence: "medium",
      originalUserNotes: photo.conditions?.notes ?? null,
      timelinePlacement: sameDayWeight?.weight
        ? `${formatDate(getPhotoDate(photo))} with same-day ${formatWeight(sameDayWeight.weight)} weigh-in.`
        : `${formatDate(getPhotoDate(photo))} with no same-day weight entry.`,
      metadata: {
        label: getPhotoLabel(normalizedPhoto),
        detail: getPhotoDetail(normalizedPhoto),
        dateKey,
        sameDayWeightId: sameDayWeight?.id ?? null,
        weightLabel: sameDayWeight?.weight ? formatWeight(sameDayWeight.weight) : null,
      },
    });
  });
}

function getPreviousMatchingPhoto(photo, photos) {
  const currentDate = getDateKey(getPhotoDate(photo));

  return (
    photos
      .map(normalizeProgressPhoto)
      .filter(
        (candidate) =>
          getDateKey(getPhotoDate(candidate)) < currentDate &&
          candidate.view === photo.view &&
          candidate.pose === photo.pose
      )
      .at(-1) ?? null
  );
}

function normalizeProgressPhoto(photo = {}) {
  return normalizeProgressPhotoCategory(photo);
}

function getPhotoObservations(photo, previousPhoto) {
  if (!previousPhoto) {
    return [
      createObservation({
        category: "baseline",
        description: "This creates a matching-view baseline for future comparison.",
        comparisonBasis: "first matching view",
      }),
      createObservation({
        category: "confidence",
        description:
          "Trend quality improves when the next equivalent photo is captured.",
        comparisonBasis: "future comparison",
      }),
    ];
  }

  if (photo.view === "back") {
    const categoryLabel = getProgressPhotoCategoryLabel(photo).toLowerCase();

    return [
      createObservation({
        category: "definition",
        description:
          `Rear taper and back definition can be compared against the prior ${categoryLabel} check-in.`,
        comparisonBasis: `previous ${categoryLabel} photo`,
        goalRelevance: ["goal_preserve_lean_mass"],
      }),
      createObservation({
        category: "symmetry",
        description: "This view supports symmetry and lean-mass preservation context.",
        comparisonBasis: "same-view visual evidence",
        goalRelevance: ["goal_preserve_lean_mass"],
      }),
    ];
  }

  if (photo.view === "front") {
    return [
      createObservation({
        category: "visible_abs",
        description: "Front relaxed comparison supports visible-abs progress review.",
        comparisonBasis: "previous front relaxed photo",
        goalRelevance: ["goal_visible_abs_at_rest"],
      }),
      createObservation({
        category: "remaining_focus",
        description: "Waist and lower-abdominal definition remain the key visual signals.",
        comparisonBasis: "same-view visual evidence",
        goalRelevance: ["goal_visible_abs_at_rest"],
      }),
    ];
  }

  return [
    createObservation({
      category: "visual_evidence",
      description: "This photo is structured evidence for future visual comparison.",
      comparisonBasis: "photo metadata",
    }),
  ];
}

function createObservation({
  category,
  description,
  direction = "neutral",
  confidence = "medium",
  comparisonBasis = "",
  goalRelevance = [],
}) {
  return {
    category,
    direction,
    description,
    confidence,
    comparisonBasis,
    goalRelevance,
  };
}

function getPhotoStrengths(photo, previousPhoto) {
  if (photo.view === "back") {
    const categoryLabel = getProgressPhotoCategoryLabel(photo);

    return [
      previousPhoto
        ? `Shoulder-to-waist taper and back definition are comparable against the prior ${categoryLabel.toLowerCase()} photo.`
        : `${categoryLabel} view establishes a useful taper and symmetry baseline.`,
      "Rear photos support Preserve Lean Mass alongside the primary visible-abs goal.",
    ];
  }

  if (photo.view === "front") {
    return [
      previousPhoto
        ? "Upper-ab and waistline changes can be compared against the prior front relaxed photo."
        : "Front relaxed view establishes the clearest baseline for Visible Abs at Rest.",
      "This is the most directly relevant view for the primary goal.",
    ];
  }

  return ["Consistent photo metadata keeps this evidence usable for future comparison."];
}

function getPhotoRemainingFocus(photo) {
  if (photo.view === "front") {
    return [
      "Continue collecting front relaxed photos to confirm lower-abdominal definition.",
      "Lower abdominal definition remains the limiting visual milestone.",
    ];
  }

  if (photo.view === "back") {
    return [
      "Continue rear photos to monitor muscle retention and conditioning.",
      "Use DEXA as the higher-confidence calibration source.",
    ];
  }

  return ["Capture the same view again under matching conditions before drawing conclusions."];
}

function getPhotoConfidenceImpact(photo) {
  const confirmedCoreContext =
    photo.conditions?.morning &&
    photo.conditions?.fasted &&
    photo.conditions?.sameLighting;

  if (confirmedCoreContext) {
    return {
      level: "high",
      summary:
        "High. Confirmed morning, fasted, same-lighting conditions make this useful visual calibration evidence.",
      factors: ["morning", "fasted", "same lighting"],
      limitations: [],
    };
  }

  return {
    level: "moderate",
    summary:
      "Moderate. Date, view, and pose are verified, but some capture conditions are unknown.",
    factors: ["verified date", "verified view", "verified pose"],
    limitations: ["some capture conditions are unknown"],
  };
}

function getPhotoLimitations(photo, previousPhoto) {
  const limitations = [];

  if (!previousPhoto) limitations.push("No previous matching-view photo yet.");
  if (!photo.conditions?.morning) limitations.push("Morning context is unconfirmed.");
  if (!photo.conditions?.fasted) limitations.push("Fasted context is unconfirmed.");
  if (!photo.conditions?.sameLighting) limitations.push("Lighting match is unconfirmed.");

  return limitations;
}

function getKnownPhotoTags(photo) {
  const tags = [getPhotoLabel(photo)];

  if (photo.conditions?.morning) tags.push("morning");
  if (photo.conditions?.fasted) tags.push("fasted");
  if (photo.conditions?.sameLighting) tags.push("same lighting");
  if (photo.conditions?.sameMirror) tags.push("same mirror");
  if (photo.conditions?.postWorkout === false) tags.push("no post-workout");
  if (photo.conditions?.pump === false) tags.push("no pump");

  return tags.filter(Boolean).map((tag) => tag.toLowerCase());
}

function getPhotoDetail(photo) {
  const conditions = [];

  if (photo.conditions?.morning) conditions.push("morning");
  if (photo.conditions?.fasted) conditions.push("fasted");
  if (photo.conditions?.sameLighting) conditions.push("same lighting");

  return conditions.length > 0 ? conditions.join(", ") : "";
}

function getPhotoLabel(photo) {
  return getProgressPhotoCategoryLabel(photo);
}

function getPhotoDate(photo) {
  return photo.date ?? photo.capturedAt ?? "";
}

function getDateKey(value) {
  return String(value ?? "").slice(0, 10);
}

function formatWeight(weight) {
  if (!weight?.value) return "Pending";

  return `${weight.value.toFixed(1)} ${weight.unit ?? "lb"}`;
}

function formatDate(value) {
  if (!value) return "Pending";

  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  const date =
    year && month && day ? new Date(year, month - 1, day) : new Date(value);

  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatLabel(value) {
  return String(value ?? "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
