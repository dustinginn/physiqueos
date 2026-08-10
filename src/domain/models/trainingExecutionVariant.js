const EXECUTION_VARIANT_ALIASES = Object.freeze({
  "static holds": "static hold",
});

export const ORDINARY_EXECUTION_VARIANT_KEY = "ordinary";

export function normalizeTrainingExecutionVariant(value) {
  const source = typeof value === "string"
    ? value
    : value?.rawLabel ?? value?.label ?? value?.key;
  const rawLabel = cleanVariantText(source);
  if (!rawLabel) return null;

  const normalizedSource = normalizeVariantText(rawLabel);
  const alias = EXECUTION_VARIANT_ALIASES[normalizedSource] ?? null;
  const normalizedText = alias ?? normalizedSource;
  if (!normalizedText) return null;

  return {
    key: normalizedText.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""),
    label: resolveVariantLabel(value, rawLabel, alias),
    rawLabel,
  };
}

export function parseTrailingExecutionVariant(value) {
  const source = String(value ?? "").trim();
  const match = source.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  if (!match) return null;

  const baseLabel = match[1].trim();
  const executionVariant = normalizeTrainingExecutionVariant(match[2]);
  if (!baseLabel || !executionVariant) return null;

  return { baseLabel, executionVariant };
}

export function getTrainingExecutionVariantKey(exerciseOrVariant) {
  const value = exerciseOrVariant?.executionVariant ?? exerciseOrVariant;
  return normalizeTrainingExecutionVariant(value)?.key ?? ORDINARY_EXECUTION_VARIANT_KEY;
}

export function haveSameTrainingExecutionVariant(left, right) {
  return getTrainingExecutionVariantKey(left) === getTrainingExecutionVariantKey(right);
}

export function getTrainingExerciseOccurrenceKey(exercise = {}, canonicalKey = null) {
  const movementKey = canonicalKey ?? exercise.canonicalExerciseId ?? exercise.name ?? exercise.id;
  return `${String(movementKey ?? "").trim()}|variant:${getTrainingExecutionVariantKey(exercise)}`;
}

export function formatTrainingExerciseOccurrenceLabel(exercise = {}) {
  const name = String(exercise.name ?? "").trim();
  const variant = normalizeTrainingExecutionVariant(exercise.executionVariant);
  return variant ? `${name} · ${variant.label}` : name;
}

function cleanVariantText(value) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return text || null;
}

function normalizeVariantText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleVariantLabel(value) {
  return String(value ?? "").replace(/\b\w/g, (character) => character.toUpperCase());
}

function resolveVariantLabel(value, rawLabel, alias) {
  if (alias) return titleVariantLabel(alias);
  const explicitLabel = typeof value === "object" ? cleanVariantText(value?.label) : null;
  if (explicitLabel) return explicitLabel;
  if (typeof value === "object" && !value?.rawLabel && value?.key) {
    return titleVariantLabel(normalizeVariantText(value.key));
  }

  const letters = rawLabel.replace(/[^a-z]/gi, "");
  const hasUniformCase = letters && (
    letters === letters.toLowerCase() || letters === letters.toUpperCase()
  );
  return hasUniformCase
    ? titleVariantLabel(rawLabel.toLowerCase().replace(/_/g, " "))
    : rawLabel;
}
