import { WEEK_OF_MONTH_VALUES } from "./ProtocolRecurrenceNormalizationService.js";

/// The Progress Photos editor cadence contract: "Every {interval}
/// {week|month}", plus the week of the month for a monthly cadence. The
/// canonical authority stays the protocol version recurrence; this module
/// only translates between it and the editor (Native/Web) fields.
///
/// Backward compatibility: `cadence` ("weekly" | "weekly_interval_2") is the
/// legacy editor field Build ≤80 decodes as a strict enum. It is still
/// emitted for the two schedules it can express; anything else is
/// "custom", which an old client cannot decode, so it fails closed (cannot
/// load, therefore cannot overwrite) instead of silently showing — and then
/// saving — a different schedule.
export const PROGRESS_PHOTO_CADENCE_UNITS = Object.freeze(["week", "month"]);
export const PROGRESS_PHOTO_MAX_INTERVAL = 12;
export const PROGRESS_PHOTO_DEFAULT_WEEK_OF_MONTH = "first";

export class ProgressPhotosCadenceError extends Error {
  constructor(message) {
    super(message);
    this.name = "ProgressPhotosCadenceError";
    this.code = "PROGRESS_PHOTOS_CADENCE_INVALID";
  }
}

export function legacyProgressPhotoCadence(recurrence) {
  if (recurrence?.frequency === "weekly" && recurrence.interval === 1) return "weekly";
  if (recurrence?.frequency === "weekly" && recurrence.interval === 2) return "weekly_interval_2";
  return "custom";
}

export function progressPhotoCadenceFields(recurrence) {
  const monthly = recurrence?.frequency === "monthly";
  return Object.freeze({
    cadence: legacyProgressPhotoCadence(recurrence),
    cadenceInterval: Number(recurrence?.interval ?? 1),
    cadenceUnit: monthly ? "month" : "week",
    weekOfMonth: monthly ? recurrence.weekOfMonth : null,
  });
}

/// Resolves the requested cadence from an editor draft. A draft that names
/// `cadenceUnit` is authoritative; a legacy draft (Build ≤80 / old Web)
/// carries only `cadence`, which must be one of the two legacy values —
/// anything else is rejected rather than silently becoming weekly.
export function resolveRequestedProgressPhotoCadence(photos = {}) {
  const unit = photos.cadenceUnit;
  if (unit != null && unit !== "") {
    if (!PROGRESS_PHOTO_CADENCE_UNITS.includes(unit)) {
      throw new ProgressPhotosCadenceError("Choose weeks or months for Progress Photos.");
    }
    const interval = Number(photos.cadenceInterval);
    if (!Number.isInteger(interval) || interval < 1 || interval > PROGRESS_PHOTO_MAX_INTERVAL) {
      throw new ProgressPhotosCadenceError(
        `Choose a Progress Photos interval from 1 to ${PROGRESS_PHOTO_MAX_INTERVAL}.`,
      );
    }
    if (unit === "week") return Object.freeze({ frequency: "weekly", interval });
    const weekOfMonth = String(photos.weekOfMonth ?? "").toLowerCase();
    if (!WEEK_OF_MONTH_VALUES.includes(weekOfMonth)) {
      throw new ProgressPhotosCadenceError("Choose which week of the month to take Progress Photos.");
    }
    return Object.freeze({ frequency: "monthly", interval, weekOfMonth });
  }
  if (photos.cadence === "weekly") return Object.freeze({ frequency: "weekly", interval: 1 });
  if (photos.cadence === "weekly_interval_2") return Object.freeze({ frequency: "weekly", interval: 2 });
  throw new ProgressPhotosCadenceError("Choose a supported Progress Photos cadence.");
}

/// Applies a resolved cadence to the current recurrence. Fields that only
/// belong to the other unit are removed so a monthly → weekly change never
/// keeps a stale week of the month.
export function applyProgressPhotoCadence(recurrence, cadence, { day, timeOfDay }) {
  const next = {
    ...recurrence,
    frequency: cadence.frequency,
    interval: cadence.interval,
    weekdays: [day],
    timeOfDay,
  };
  delete next.weekOfMonth;
  delete next.type;
  delete next.cadence;
  if (cadence.frequency === "monthly") next.weekOfMonth = cadence.weekOfMonth;
  return next;
}
