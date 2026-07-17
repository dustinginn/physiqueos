import { getCanonicalTrainingExerciseLabel } from "../models/trainingExerciseIdentity";

const INTERNAL_KEYS = new Set([
  "id", "canonicalId", "canonical_id", "created_at", "createdAt", "updated_at",
  "updatedAt", "provenance", "quality", "review_metadata", "resolutionStatus",
  "source_hash", "source_artifact_refs", "evidence_type",
]);

export function createEvidenceReviewPresentation({ evidencePackage = {}, itemDecisions = {} } = {}) {
  const items = (evidencePackage.evidence_objects ?? []).map((object) => ({
    ...presentEvidenceObject(object, evidencePackage),
    included: itemDecisions[object.id]?.included !== false,
    object,
  }));
  const included = items.filter((item) => item.included);
  const excluded = items.length - included.length;

  return {
    items,
    summary: {
      included: included.length,
      excluded,
      text: buildConfirmationSummary(included),
      excludedText: buildExcludedSummary(items.filter((item) => !item.included)),
    },
  };
}

export function toggleEvidenceReviewItemDecision(itemDecisions = {}, itemId, currentlyIncluded) {
  return {
    ...itemDecisions,
    [itemId]: {
      ...itemDecisions[itemId],
      included: !currentlyIncluded,
    },
  };
}

// Pending reviews may predate a newly-specific identity. Rehydrate the candidate from
// its retained typed source before confirmation without mutating raw evidence or storage.
export function repairPendingReviewExerciseIdentities(evidencePackage = {}) {
  const typedEvidence = getTypedEvidence(evidencePackage);
  if (!/\bcable\s+machines?\s+front\s+raises?\b/i.test(typedEvidence ?? "")) return evidencePackage;
  return {
    ...evidencePackage,
    evidence_objects: (evidencePackage.evidence_objects ?? []).map((object) => object.evidence_type !== "training" ? object : ({
      ...object,
      exercises: (object.exercises ?? []).map((exercise) => /^front\s+raises?$/i.test(String(exercise.name ?? "").trim())
        ? { ...exercise, name: "Cable Machine Front Raise", equipment: "cable" }
        : exercise),
    })),
  };
}

export function presentEvidenceObject(object = {}, evidencePackage = {}) {
  const type = normalizeType(object.evidence_type);
  const sourceFiles = getSourceFiles(object, evidencePackage);
  const typedEvidence = getTypedEvidence(evidencePackage);
  const common = {
    date: formatReviewDate(object.observed_at ?? object.date ?? object.metadata?.date),
    sourceFiles,
    sourceLabel: formatSourceLabel({ evidencePackage, object }),
    typedEvidence,
    type,
  };

  if (type === "training") return presentTraining(object, common);
  if (type === "weight") return presentWeight(object, common);
  if (type === "activity") return presentActivity(object, common);
  if (type === "nutrition") return presentNutrition(object, common);
  if (type === "dexa") return presentDexa(object, common);
  if (type === "photos") return presentPhotos(object, common);
  return presentGeneric(object, common);
}

export function formatExerciseSet(set = {}) {
  const duration = finite(set.duration_seconds ?? set.durationSeconds);
  if (duration != null && duration > 0) return formatDuration(duration, { clock: true });

  const reps = finite(set.reps);
  const weight = finite(set.weight ?? set.load);
  const bodyweight = set.load_type === "bodyweight" || set.weight_unit === "bodyweight" || /body\s*weight/i.test(String(set.weight ?? ""));
  if (reps != null && bodyweight) return `${formatNumber(reps)} reps · Bodyweight`;
  if (reps != null && weight != null) return `${formatNumber(reps)} reps @ ${formatNumber(weight)} ${set.weight_unit && set.weight_unit !== "bodyweight" ? set.weight_unit : "lb"}`;
  if (reps != null) return `${formatNumber(reps)} reps`;
  if (weight != null) return `${formatNumber(weight)} ${set.weight_unit ?? "lb"}`;
  return null;
}

export function formatReviewDate(value) {
  if (!value) return null;
  const dateKey = String(value).slice(0, 10);
  const [year, month, day] = dateKey.split("-").map(Number);
  if (![year, month, day].every(Number.isFinite)) return String(value);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDuration(seconds, { clock = false } = {}) {
  const value = finite(seconds);
  if (value == null || value <= 0) return null;
  const rounded = Math.round(value);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remaining = rounded % 60;
  if (clock) return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}` : `${minutes}:${String(remaining).padStart(2, "0")}`;
  if (hours > 0) return `${hours} hr ${minutes ? `${minutes} min` : ""}`.trim();
  return minutes > 0 ? `${minutes} min` : `${remaining} sec`;
}

function presentTraining(object, common) {
  const metadata = object.metadata ?? {};
  return {
    ...common,
    title: metadata.activity_type ?? object.title ?? "Workout",
    noun: "workout",
    metrics: compact([
      metric("Duration", formatDuration(metadata.duration_seconds)),
      metric("Active calories", calories(metadata.active_calories)),
      metric("Average heart rate", unit(metadata.average_heart_rate, "bpm")),
      metric("Source", common.sourceLabel),
    ]),
    exercises: (object.exercises ?? []).filter((exercise) => !exercise.removed).map((exercise) => ({
      name: getCanonicalTrainingExerciseLabel(exercise.name),
      sets: (exercise.sets ?? []).map((set) => formatExerciseSet({
        ...set,
        load_type: exercise.equipment === "bodyweight" && Number(set.weight) === 0 ? "bodyweight" : set.load_type,
      })).filter(Boolean),
    })),
  };
}

function presentWeight(object, common) {
  const value = object.value ?? object.weight?.value ?? object.metadata?.weight;
  return { ...common, title: "Weight", noun: "weight entry", metrics: compact([metric("Weight", unit(value, object.unit ?? object.weight?.unit ?? "lb")), metric("Source", common.sourceLabel)]) };
}

function presentActivity(object, common) {
  const metadata = object.metadata ?? {};
  const activity = object.daily_activity ?? {};
  return { ...common, title: object.title ?? "Activity", noun: "activity entry", metrics: compact([metric("Active calories", calories(metadata.active_calories ?? object.active_calories ?? activity.move_calories)), metric("Exercise", unit(metadata.exercise_minutes ?? object.exercise_minutes ?? activity.exercise_minutes, "min")), metric("Duration", formatDuration(metadata.duration_seconds ?? object.duration_seconds)), metric("Source", common.sourceLabel)]) };
}

function presentNutrition(object, common) {
  const metadata = object.metadata ?? {};
  const totals = object.daily_totals ?? {};
  return { ...common, title: "Nutrition", noun: "nutrition entry", metrics: compact([metric("Calories", calories(object.calories ?? metadata.calories ?? object.total_calories ?? totals.calories)), metric("Protein", unit(object.protein ?? metadata.protein ?? totals.protein_g, "g")), metric("Carbs", unit(object.carbs ?? metadata.carbs ?? totals.carbs_g, "g")), metric("Fat", unit(object.fat ?? metadata.fat ?? totals.fat_g, "g")), metric("Source", common.sourceLabel)]) };
}

function presentDexa(object, common) {
  const metadata = object.metadata ?? {};
  return { ...common, title: "DEXA", noun: "DEXA scan", metrics: compact([metric("Weight", unit(metadata.totalMass, "lb")), metric("Lean mass", unit(metadata.leanMass, "lb")), metric("Fat mass", unit(metadata.fatMass, "lb")), metric("Body fat", unit(metadata.bodyFatPercentage, "%")), metric("Source", common.sourceLabel)]) };
}

function presentPhotos(object, common) {
  return { ...common, title: "Progress Photos", noun: "photo session", metrics: compact([metric("Views", (object.photos ?? []).filter((photo) => photo.active !== false).map((photo) => labelize(`${photo.view} ${photo.pose}`)).join(", ")), metric("Source", common.sourceLabel)]) };
}

function presentGeneric(object, common) {
  const values = { ...(object.metadata ?? {}), ...object };
  const metrics = Object.entries(values).filter(([key, value]) => !INTERNAL_KEYS.has(key) && value != null && value !== "" && !Array.isArray(value) && typeof value !== "object").slice(0, 6).map(([key, value]) => metric(labelize(key), String(value)));
  return { ...common, title: labelize(object.evidence_type ?? "Evidence"), noun: "evidence item", metrics };
}

function buildConfirmationSummary(items) {
  if (!items.length) return "Nothing is currently selected";
  const counts = new Map();
  items.forEach((item) => counts.set(item.noun, (counts.get(item.noun) ?? 0) + 1));
  return [...counts].map(([noun, count]) => `${count} ${count === 1 ? noun : pluralize(noun)}`).join(" and ");
}

function buildExcludedSummary(items) {
  if (!items.length) return null;
  const counts = new Map();
  items.forEach((item) => counts.set(item.noun, (counts.get(item.noun) ?? 0) + 1));
  return `${[...counts].map(([noun, count]) => `${count} ${count === 1 ? noun : pluralize(noun)}`).join(" and ")} excluded`;
}

function pluralize(noun) { return noun.endsWith("entry") ? `${noun.slice(0, -5)}entries` : `${noun}s`; }
function normalizeType(type) { if (["morning_weight", "weight"].includes(type)) return "weight"; if (["activity_day", "activity"].includes(type)) return "activity"; if (["dexa_scan", "dexa", "body_composition"].includes(type)) return "dexa"; if (["photo_session", "progress_photo"].includes(type)) return "photos"; return type; }
function getSourceFiles(object, evidencePackage) { return unique([...(object.provenance?.source_artifact_refs ?? []), ...(object.metadata?.provenance ?? []), ...(evidencePackage.provenance?.source_artifacts ?? []).map((item) => item.file_name ?? item.filename ?? item.name).filter(Boolean)]); }
function getTypedEvidence(evidencePackage) { return (evidencePackage.provenance?.source_artifacts ?? []).filter((item) => item.text && /text|typed/i.test(`${item.type ?? ""} ${item.kind ?? ""} ${item.mime_type ?? ""}`)).map((item) => item.text).join("\n\n") || null; }
function formatSourceLabel({ evidencePackage, object }) { const artifacts = evidencePackage.provenance?.source_artifacts ?? []; const hasImage = artifacts.some((item) => /image|screenshot/i.test(`${item.type ?? ""} ${item.kind ?? ""} ${item.mime_type ?? ""}`)) || /screenshot|image/i.test(`${object.source?.modality ?? ""} ${object.metadata?.source ?? ""}`); const hasText = Boolean(getTypedEvidence(evidencePackage)); const correction = Boolean(object.correctionStatus || object.reviewStatus === "correction"); return [hasImage ? "Screenshot" : null, hasText ? "Typed evidence" : null, correction ? "Correction" : null].filter(Boolean).join(" + ") || labelize(object.metadata?.source ?? object.source?.name ?? "Submitted evidence"); }
function calories(value) { return unit(value, "cal"); }
function unit(value, suffix) { const number = finite(value); return number == null ? null : `${formatNumber(number)} ${suffix}`; }
function formatNumber(value) { return Number(value).toLocaleString("en-US", { maximumFractionDigits: 1 }); }
function finite(value) { if (value == null || value === "") return null; const number = Number(value); return Number.isFinite(number) ? number : null; }
function metric(label, value) { return value ? { label, value } : null; }
function compact(values) { return values.filter(Boolean); }
function unique(values) { return [...new Set(values.filter(Boolean).map(String))]; }
function labelize(value) { return String(value ?? "").replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase()); }
