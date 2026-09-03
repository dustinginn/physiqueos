// Shared scalar Weight validation for every Native sandbox Weight write path
// (artifact-backed candidate and manual scalar entry). Mirrors the bounds and
// rounding production manual Weight already enforces in
// src/app/log/actions.js and src/app/check-in/morning/actions.js (50-1000,
// rounded to one decimal) so no second Weight validation model exists.
export function validWeight(value) {
  const result = Number(value);
  if (!Number.isFinite(result) || result < 50 || result > 1_000) {
    throw new Error("Enter a valid Weight value.");
  }
  return Math.round(result * 10) / 10;
}

export function validUnit(value) {
  const unit = String(value ?? "").toLowerCase();
  if (!["lb", "kg"].includes(unit)) throw new Error("Weight unit must be lb or kg.");
  return unit;
}

// A server-owned calendar date (YYYY-MM-DD). Validated against UTC
// round-tripping only to reject impossible dates (e.g. 2026-02-30); the
// value itself is never shifted through a timezone conversion.
export function calendarWeightDate(value) {
  const candidate = String(value ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) throw new Error("The measurement date is invalid.");
  const [year, month, day] = candidate.split("-").map(Number);
  if (new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) !== candidate) {
    throw new Error("The measurement date is invalid.");
  }
  return candidate;
}
