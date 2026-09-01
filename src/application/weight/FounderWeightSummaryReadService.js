import { requireScope } from "../auth/principal.js";

export function createFounderWeightSummaryReadService({ readLatestWeight } = {}) {
  if (typeof readLatestWeight !== "function") {
    throw new Error("The Founder Weight summary requires a canonical Weight reader.");
  }

  return Object.freeze({
    async getCurrentWeight({ principal }) {
      const actor = requireScope(principal, "founder:read");
      const entry = await readLatestWeight(actor.userId);
      return Object.freeze({
        schemaVersion: "1",
        currentWeight: entry ? toCurrentWeight(entry) : null,
      });
    },
  });
}

function toCurrentWeight(entry) {
  const measurementDate = calendarDate(entry.measuredAt);
  const value = Number(entry.weight?.value);
  const unit = String(entry.weight?.unit ?? "").toLowerCase();
  if (!String(entry.id ?? "").trim() || !Number.isFinite(value) || value <= 0 || !["lb", "kg"].includes(unit)) {
    throw new Error("The canonical Weight entry cannot be represented by the Native summary contract.");
  }
  return Object.freeze({
    id: String(entry.id),
    value,
    unit,
    measurementDate,
  });
}

function calendarDate(value) {
  const candidate = String(value ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) throw new Error("The canonical Weight date is unavailable.");
  const [year, month, day] = candidate.split("-").map(Number);
  if (new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) !== candidate) {
    throw new Error("The canonical Weight date is invalid.");
  }
  return candidate;
}
