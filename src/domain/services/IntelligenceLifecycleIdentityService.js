export const INTELLIGENCE_LIFECYCLE_IDENTITY_VERSION =
  "intelligence_lifecycle_identity_v1";

const RECURRING_PRECEDENCE = Object.freeze({
  midweek: 100,
  weekly: 200,
  monthly: 300,
});

export function createPIExecutionIdentity({
  ownerUserId,
  publisherType,
  goalId,
  phaseId,
  occurrenceId,
  artifactId,
  evidenceWindowId,
  evidenceCutoff,
  idempotencyKey,
} = {}) {
  return [
    "pi-execution",
    INTELLIGENCE_LIFECYCLE_IDENTITY_VERSION,
    required(ownerUserId, "ownerUserId"),
    required(publisherType, "publisherType"),
    required(goalId, "goalId"),
    phaseId == null ? "no-phase" : required(phaseId, "phaseId"),
    required(occurrenceId, "occurrenceId"),
    required(artifactId, "artifactId"),
    required(evidenceWindowId, "evidenceWindowId"),
    normalizeTimestamp(evidenceCutoff, "evidenceCutoff"),
    required(idempotencyKey, "idempotencyKey"),
  ].map(encodeURIComponent).join("|");
}

export function createBriefingCadenceExecutionIdentity({
  ownerUserId,
  cadenceKey,
  expectedArtifactId,
} = {}) {
  return `briefing-cadence:${required(ownerUserId, "ownerUserId")}:` +
    `${requiredCadence(cadenceKey)}:${required(
      expectedArtifactId, "expectedArtifactId"
    )}`;
}

export function applyRecurringBriefingPrecedence(entries = []) {
  const eligible = entries.filter((entry) => entry?.eligible === true);
  const winner = [...eligible].sort((left, right) =>
    precedence(right.cadence) - precedence(left.cadence)
  )[0] ?? null;
  if (!winner || winner.cadence !== "monthly") return entries;
  return entries.map((entry) => {
    if (!entry?.eligible || entry.cadence === winner.cadence) return entry;
    return {
      ...entry,
      eligible: false,
      eligibilityReason: "superseded_by_monthly",
      supersededByCadence: "monthly",
      supersededByArtifactId: winner.expectedArtifactId ?? null,
    };
  });
}

export function resolveIntelligenceEvidenceCutoff({
  value,
  timeZone = "America/Los_Angeles",
} = {}) {
  const raw = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return localDateTimeToUtc({
      date: raw,
      time: "23:59:59.999",
      timeZone,
    }).toISOString();
  }
  return normalizeTimestamp(raw, "evidenceCutoff");
}

export function localDateTimeToUtc({ date, time, timeZone } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date ?? "")) ||
      !/^\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/.test(String(time ?? "")) ||
      typeof timeZone !== "string" || !timeZone.trim()) {
    throw new Error("A valid local date, time, and timezone are required.");
  }
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute, secondWithMilliseconds = "0"] = time.split(":");
  const [second, milliseconds = "0"] = secondWithMilliseconds.split(".");
  const desired = Date.UTC(
    year,
    month - 1,
    day,
    Number(hour),
    Number(minute),
    Number(second),
    Number(milliseconds.padEnd(3, "0").slice(0, 3))
  );
  let guess = desired;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).formatToParts(new Date(guess))
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value])
    );
    const represented = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour === "24" ? "0" : parts.hour),
      Number(parts.minute),
      Number(parts.second),
      Number(milliseconds.padEnd(3, "0").slice(0, 3))
    );
    const adjustment = desired - represented;
    guess += adjustment;
    if (adjustment === 0) break;
  }
  return new Date(guess);
}

function precedence(cadence) {
  return RECURRING_PRECEDENCE[cadence] ?? 0;
}

function requiredCadence(value) {
  const cadence = required(value, "cadenceKey");
  if (!(cadence in RECURRING_PRECEDENCE)) {
    throw new Error("cadenceKey is not a recurring briefing cadence.");
  }
  return cadence;
}

function required(value, field) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${field} is required.`);
  return normalized;
}

function normalizeTimestamp(value, field) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${field} is invalid.`);
  return new Date(parsed).toISOString();
}
