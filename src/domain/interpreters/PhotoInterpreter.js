import {
  createVisualEvidence,
  VisualEvidenceSourceType,
} from "./VisualEvidence";

export function interpretProgressPhotos({ photos = [], weights = [] } = {}) {
  const sortedPhotos = [...photos].sort((a, b) =>
    getPhotoDate(a).localeCompare(getPhotoDate(b))
  );

  return sortedPhotos.map((photo) => {
    const previousPhoto = getPreviousMatchingPhoto(photo, sortedPhotos);
    const dateKey = getDateKey(getPhotoDate(photo));
    const sameDayWeight = weights.find((entry) => getDateKey(entry.measuredAt) === dateKey);

    return createVisualEvidence({
      id: `visual-${photo.id}`,
      sourceId: photo.id,
      sourceType: VisualEvidenceSourceType.PROGRESS_PHOTO,
      imageRef: photo.imagePath ?? "",
      evidenceDate: getPhotoDate(photo),
      uploadDate: photo.uploadedAt ?? null,
      viewType: photo.view ?? "unknown",
      capturedAt: getPhotoDate(photo),
      uploadedAt: photo.uploadedAt ?? null,
      imagePath: photo.imagePath ?? "",
      view: photo.view ?? "unknown",
      pose: photo.pose ?? "unknown",
      tags: getKnownPhotoTags(photo),
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
      observations: getPhotoObservations(photo, previousPhoto),
      biggestImprovements: getPhotoStrengths(photo, previousPhoto),
      remainingFocus: getPhotoRemainingFocus(photo),
      confidenceImpact: getPhotoConfidenceImpact(photo),
      limitations: getPhotoLimitations(photo, previousPhoto),
      extractionConfidence: "medium",
      originalUserNotes: photo.conditions?.notes ?? null,
      timelinePlacement: sameDayWeight?.weight
        ? `${formatDate(getPhotoDate(photo))} with same-day ${formatWeight(sameDayWeight.weight)} weigh-in.`
        : `${formatDate(getPhotoDate(photo))} with no same-day weight entry.`,
      metadata: {
        label: getPhotoLabel(photo),
        detail: getPhotoDetail(photo),
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
      .filter(
        (candidate) =>
          getDateKey(getPhotoDate(candidate)) < currentDate &&
          candidate.view === photo.view &&
          candidate.pose === photo.pose
      )
      .at(-1) ?? null
  );
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

  if (photo.view === "back" && photo.pose === "double_biceps") {
    return [
      createObservation({
        category: "muscle_retention",
        description:
          "Back and shoulder definition can be compared against the prior matching pose.",
        comparisonBasis: "previous matching pose",
        goalRelevance: ["goal_preserve_lean_mass", "goal_visible_abs_at_rest"],
      }),
      createObservation({
        category: "visual_quality",
        description:
          "Muscle-retention appearance remains the primary signal in this view.",
        comparisonBasis: "same-view visual evidence",
        goalRelevance: ["goal_preserve_lean_mass"],
      }),
    ];
  }

  if (photo.view === "back") {
    return [
      createObservation({
        category: "definition",
        description:
          "Rear taper and back definition can be compared against the prior relaxed rear check-in.",
        comparisonBasis: "previous rear relaxed photo",
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
  if (photo.view === "back" && photo.pose === "double_biceps") {
    return [
      previousPhoto
        ? "Back width, shoulder shape, and arm retention can be reviewed against the prior check-in."
        : "Rear double-biceps view establishes a useful muscle-retention baseline.",
      "This pose is valuable for judging whether the cut is preserving visual muscularity.",
    ];
  }

  if (photo.view === "back") {
    return [
      previousPhoto
        ? "Shoulder-to-waist taper and back definition are comparable against the prior rear relaxed photo."
        : "Rear relaxed view establishes a useful taper and symmetry baseline.",
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
  return `${formatLabel(photo.view)} ${formatLabel(photo.pose)}`;
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
