export const DEFAULT_EVIDENCE_TIME_ZONE = "America/Los_Angeles";

export function resolveCanonicalEvidenceLocalDate(
  value = {},
  { timeZone = null } = {}
) {
  const payload = value?.payload ?? value ?? {};
  const explicit = firstCalendarDate([
    payload.intendedLocalDate,
    payload.intended_local_date,
    payload.date,
    payload.metadata?.date,
    payload.metadata?.local_date,
  ]);
  if (explicit) return explicit;

  const observed = payload.observed_at ?? payload.observedAt ??
    payload.occurredAt ?? payload.captured_at ?? payload.capturedAt;
  if (observed == null || observed === "") return null;
  const observedText = String(observed);
  if (/^\d{4}-\d{2}-\d{2}$/.test(observedText)) return observedText;

  const resolvedTimeZone = timeZone ?? payload.timeZone ?? payload.time_zone ??
    payload.metadata?.timeZone ?? payload.metadata?.time_zone ??
    payload.source?.timeZone ?? payload.source?.time_zone ??
    DEFAULT_EVIDENCE_TIME_ZONE;
  const date = observed instanceof Date ? observed : new Date(observed);
  if (!Number.isFinite(date.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      day: "2-digit",
      month: "2-digit",
      timeZone: resolvedTimeZone,
      year: "numeric",
    }).formatToParts(date);
    const part = (type) => parts.find((item) => item.type === type)?.value;
    return `${part("year")}-${part("month")}-${part("day")}`;
  } catch {
    return null;
  }
}

function firstCalendarDate(values) {
  return values
    .map((value) => String(value ?? ""))
    .find((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)) ?? null;
}
