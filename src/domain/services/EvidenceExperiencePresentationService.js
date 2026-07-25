const DEFAULT_TIME_ZONE = "America/Los_Angeles";

const COPY = {
  activity: { eyebrow: "ACTIVITY FOUND", noun: "activity", reviewingBody: "Looking through your activity before you confirm it.", reviewingTitle: "Reviewing your activity", savedBody: "Your activity has been added to your progress.", savedTitle: "Activity Saved" },
  nutrition: { eyebrow: "NUTRITION FOUND", noun: "nutrition", reviewingBody: "Looking through your meals and daily totals before you confirm them.", reviewingTitle: "Reviewing your nutrition", savedBody: "Your nutrition for the day has been added to your progress.", savedTitle: "Nutrition Saved" },
  training: { eyebrow: "WORKOUT FOUND", noun: "workout", reviewingBody: "Looking through your training before you confirm it.", reviewingTitle: "Reviewing your workout", savedBody: "Your workout has been added to your progress.", savedTitle: "Workout Saved" },
  fallback: { eyebrow: "UPLOAD FOUND", noun: "evidence", reviewingBody: "Checking the details before you confirm them.", reviewingTitle: "Reviewing your upload", savedBody: "Your update has been added to your progress.", savedTitle: "Evidence Saved" },
};

export function createEvidenceExperiencePresentation(review, { now = new Date() } = {}) {
  const evidencePackage = review?.interpretedEvidence ?? {};
  const objects = evidencePackage.evidence_objects ?? [];
  const copy = COPY[getPrimaryEvidenceType(objects)] ?? COPY.fallback;
  const dateKey = getEvidenceDateKey(evidencePackage, objects);
  return {
    ...copy,
    dateKey,
    friendlyDate: dateKey && dateKey !== getTodayKey(now) ? formatFriendlyDate(dateKey) : null,
    savingLabel: `Saving your ${copy.noun}\u2026`,
  };
}

export function formatFriendlyDate(dateKey) {
  const [year, month, day] = String(dateKey ?? "").split("-").map(Number);
  if (![year, month, day].every(Number.isFinite)) return null;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    day: "numeric", month: "long", weekday: "long", year: "numeric",
  });
}

function getPrimaryEvidenceType(objects) {
  const types = new Set(objects.filter((item) => item.removed !== true).map((item) => item.evidence_type));
  if (types.has("training")) return "training";
  if (types.has("nutrition")) return "nutrition";
  if (types.has("activity_day") || types.has("activity")) return "activity";
  return "fallback";
}

function getEvidenceDateKey(evidencePackage, objects) {
  const value = evidencePackage.observed_at ?? objects.find((item) => item.removed !== true)?.observed_at;
  const dateKey = String(value ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? dateKey : null;
}

function getTodayKey(now) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit", month: "2-digit", timeZone: DEFAULT_TIME_ZONE, year: "numeric",
  }).formatToParts(now);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
