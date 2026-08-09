export const EVIDENCE_RECOVERY_RETURN_PATH = "/check-in/morning";

export const EVIDENCE_RECOVERY_TYPES = Object.freeze([
  "photo_session",
  "training",
  "activity_day",
  "nutrition",
]);

const TYPE_SET = new Set(EVIDENCE_RECOVERY_TYPES);
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function createEvidenceRecoveryContext(input = {}) {
  input ??= {};
  const date = normalizeDate(input.date);
  const expectedEvidenceType = normalizeEvidenceRecoveryType(
    input.expectedEvidenceType
  );
  const recoveryKey = normalizeText(input.recoveryKey);
  const returnTo = normalizeEvidenceRecoveryReturnTo(input.returnTo);

  if (!date || !expectedEvidenceType || !recoveryKey || !returnTo) return null;

  return Object.freeze({
    date,
    expectedEvidenceType,
    recoveryKey,
    returnTo,
  });
}

export function parseEvidenceRecoverySearchParams(params = {}) {
  return createEvidenceRecoveryContext({
    date: valueOf(params, "date"),
    expectedEvidenceType: valueOf(params, "expectedEvidenceType"),
    recoveryKey: valueOf(params, "recoveryKey"),
    returnTo: valueOf(params, "returnTo"),
  });
}

export function parseEvidenceRecoveryFormData(formData) {
  if (!formData?.get) return null;
  return createEvidenceRecoveryContext({
    date: formData.get("recoveryDate"),
    expectedEvidenceType: formData.get("recoveryEvidenceType"),
    recoveryKey: formData.get("recoveryKey"),
    returnTo: formData.get("returnTo"),
  });
}

export function appendEvidenceRecoveryContext(path, context) {
  const normalized = createEvidenceRecoveryContext(context);
  if (!normalized) return path;
  const separator = String(path).includes("?") ? "&" : "?";
  return `${path}${separator}${toEvidenceRecoverySearchParams(normalized)}`;
}

export function toEvidenceRecoverySearchParams(context) {
  const normalized = createEvidenceRecoveryContext(context);
  if (!normalized) return "";
  return new URLSearchParams(normalized).toString();
}

export function normalizeEvidenceRecoveryReturnTo(value) {
  return normalizeText(value) === EVIDENCE_RECOVERY_RETURN_PATH
    ? EVIDENCE_RECOVERY_RETURN_PATH
    : null;
}

export function normalizeEvidenceRecoveryType(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  const aliases = {
    activity: "activity_day",
    nutrition_day: "nutrition",
    photos: "photo_session",
    progress_photo: "photo_session",
    progress_photos: "photo_session",
    training_session: "training",
    workout: "training",
  };
  const resolved = aliases[normalized] ?? normalized;
  return TYPE_SET.has(resolved) ? resolved : null;
}

export function evidenceReviewMatchesRecoveryContext(review, context) {
  const normalized = createEvidenceRecoveryContext(context);
  if (!normalized || !review) return false;
  return (review.interpretedEvidence?.evidence_objects ?? []).some((object) => {
    if (object.removed === true || review.itemDecisions?.[object.id]?.included === false) {
      return false;
    }
    const type = normalizeEvidenceRecoveryType(object.evidence_type);
    const payload = object.payload ?? object;
    const date = String(
      payload.observed_at ?? payload.date ?? payload.captureDate ??
      payload.capturedAt ?? ""
    ).slice(0, 10);
    return type === normalized.expectedEvidenceType && date === normalized.date;
  });
}

function normalizeDate(value) {
  const date = String(value ?? "").trim().slice(0, 10);
  if (!DATE_KEY.test(date)) return null;
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
    ? date
    : null;
}

function normalizeText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function valueOf(params, key) {
  const value = typeof params?.get === "function" ? params.get(key) : params?.[key];
  return Array.isArray(value) ? value[0] : value;
}
