const DAY_LABELS = Object.freeze({
  sunday: "Sunday", monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday",
  thursday: "Thursday", friday: "Friday", saturday: "Saturday",
});

export function normalizeSupportSchedule(value = {}) {
  const frequency = ["daily", "weekly", "specific_days", "every_x_days"].includes(value.frequency)
    ? value.frequency
    : "weekly";
  const daysOfWeek = [...new Set(value.daysOfWeek ?? [])].filter((day) => DAY_LABELS[day]);
  const timing = ["morning", "afternoon", "evening", "specific"].includes(value.timing)
    ? value.timing
    : /^\d{2}:\d{2}$/.test(value.timeOfDay ?? "") ? "specific" : normalizeDaypart(value.timeOfDay);
  return {
    frequency,
    daysOfWeek: frequency === "daily" || frequency === "every_x_days" ? [] : daysOfWeek,
    intervalDays: frequency === "every_x_days" ? positiveInteger(value.intervalDays, 1) : 1,
    timing,
    specificTime: timing === "specific" ? String(value.specificTime ?? value.timeOfDay ?? "") : "",
    startDate: String(value.startDate ?? ""),
    endDate: value.endDate ? String(value.endDate) : null,
  };
}

export function supportScheduleToExecution(value) {
  const schedule = normalizeSupportSchedule(value);
  const cadence = schedule.frequency === "every_x_days"
    ? { type: "every_x_days", interval: schedule.intervalDays }
    : { type: schedule.frequency };
  return {
    cadence,
    preferredSchedule: {
      daysOfWeek: schedule.daysOfWeek,
      timeOfDay: schedule.timing === "specific" ? schedule.specificTime : schedule.timing,
      startDate: schedule.startDate,
      endDate: schedule.endDate,
      ...(schedule.frequency === "every_x_days"
        ? { anchorDate: schedule.startDate, intervalDays: schedule.intervalDays }
        : {}),
    },
  };
}

export function supportScheduleToReminder(value, timingContext = "") {
  const schedule = normalizeSupportSchedule(value);
  const execution = supportScheduleToExecution(schedule);
  return {
    type: schedule.frequency === "specific_days" ? "weekly_days" : schedule.frequency,
    cadence: schedule.frequency,
    interval: schedule.frequency === "every_x_days" ? schedule.intervalDays : 1,
    unit: schedule.frequency === "every_x_days" ? "day" : schedule.frequency === "daily" ? "day" : "week",
    daysOfWeek: execution.preferredSchedule.daysOfWeek,
    ...(execution.preferredSchedule.daysOfWeek.length === 1
      ? { dayOfWeek: execution.preferredSchedule.daysOfWeek[0] }
      : {}),
    timeOfDay: execution.preferredSchedule.timeOfDay,
    startDate: schedule.startDate,
    endDate: schedule.endDate,
    ...(schedule.frequency === "every_x_days" ? { anchorDate: schedule.startDate } : {}),
    timingContext: timingContext || null,
  };
}

export function hydrateSupportSchedule(executionItem, protocol) {
  const cadence = executionItem?.cadence ?? {};
  const preferred = executionItem?.preferredSchedule ?? {};
  const frequency = cadence.type === "specific_weekdays"
    ? "specific_days"
    : cadence.type === "every_other_day"
      ? "every_x_days"
      : cadence.type;
  const daysOfWeek = preferred.daysOfWeek ?? protocol?.schedule?.daysOfWeek ?? [];
  return normalizeSupportSchedule({
    frequency: daysOfWeek.length > 1
      ? "specific_days"
      : ["daily", "weekly", "specific_days", "every_x_days"].includes(frequency)
        ? frequency
        : "weekly",
    daysOfWeek,
    intervalDays: cadence.type === "every_other_day"
      ? 2
      : cadence.interval ?? preferred.intervalDays ?? 1,
    timeOfDay: preferred.timeOfDay ?? protocol?.schedule?.timeOfDay,
    startDate: preferred.startDate ?? preferred.anchorDate ?? protocol?.startDate ?? dateOnly(protocol?.activatedAt),
    endDate: preferred.endDate ?? protocol?.endDate ?? null,
  });
}

export function validateSupportSchedule(value) {
  const schedule = normalizeSupportSchedule(value);
  const errors = [];
  if (!isDateOnly(schedule.startDate)) errors.push("Choose a valid start date.");
  if (schedule.endDate && (!isDateOnly(schedule.endDate) || schedule.endDate < schedule.startDate)) errors.push("Choose an end date after the start date.");
  if (["weekly", "specific_days"].includes(schedule.frequency) && !schedule.daysOfWeek.length) errors.push("Choose at least one day.");
  if (schedule.frequency === "weekly" && schedule.daysOfWeek.length !== 1) errors.push("Choose one weekly day.");
  if (schedule.frequency === "every_x_days" && schedule.intervalDays < 1) errors.push("Choose a valid day interval.");
  if (schedule.timing === "specific" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.specificTime)) errors.push("Choose a valid time.");
  return [...new Set(errors)];
}

export function formatSupportSchedulePreview(value) {
  const schedule = normalizeSupportSchedule(value);
  let frequency;
  if (schedule.frequency === "daily") frequency = "Daily";
  else if (schedule.frequency === "every_x_days") frequency = schedule.intervalDays === 2
    ? "Every other day"
    : `Every ${schedule.intervalDays} ${schedule.intervalDays === 1 ? "day" : "days"}`;
  else {
    const days = schedule.daysOfWeek.map((day) => DAY_LABELS[day]);
    frequency = schedule.daysOfWeek.join(",") === "sunday,monday,tuesday,wednesday,thursday"
      ? "Sun–Thu"
      : days.length === 1 ? `${days[0]}s` : joinNatural(days);
  }
  const time = formatTime(schedule.timing === "specific" ? schedule.specificTime : schedule.timing);
  const start = schedule.startDate ? `starting ${formatDate(schedule.startDate)}` : "start date needed";
  const end = schedule.endDate ? `ending ${formatDate(schedule.endDate)}` : "until changed";
  const timingPhrase = schedule.timing === "specific"
    ? time ? `at ${time}` : ""
    : time ? `in the ${time.toLowerCase()}` : "";
  return `${frequency} ${timingPhrase}, ${start}, ${end}.`.replace(/\s+/g, " ");
}

export function formatSupportScheduleSummary(value) {
  const schedule = normalizeSupportSchedule(value);
  let frequency;
  if (schedule.frequency === "daily") frequency = "Daily";
  else if (schedule.frequency === "every_x_days") frequency = schedule.intervalDays === 2
    ? "Every other day"
    : `Every ${schedule.intervalDays} ${schedule.intervalDays === 1 ? "day" : "days"}`;
  else {
    const days = schedule.daysOfWeek.map((day) => DAY_LABELS[day]);
    frequency = schedule.daysOfWeek.join(",") === "sunday,monday,tuesday,wednesday,thursday"
      ? "Sun–Thu"
      : days.length === 1 ? `${days[0]}s` : joinNatural(days);
  }
  const time = formatTime(schedule.timing === "specific" ? schedule.specificTime : schedule.timing);
  return [frequency, time].filter(Boolean).join(" · ");
}

function normalizeDaypart(value) {
  if (value === "before_bed" || value === "night") return "evening";
  return ["morning", "afternoon", "evening"].includes(value) ? value : "evening";
}
function dateOnly(value) { return /^\d{4}-\d{2}-\d{2}/.test(value ?? "") ? String(value).slice(0, 10) : ""; }
function positiveInteger(value, fallback) { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback; }
function isDateOnly(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value ?? "") && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)); }
function formatDate(value) { return new Date(`${value}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }); }
function formatTime(value) {
  const labels = { morning: "Morning", afternoon: "Afternoon", evening: "Evening" };
  if (labels[value]) return labels[value];
  if (!/^\d{2}:\d{2}$/.test(value ?? "")) return "";
  const [hour, minute] = value.split(":").map(Number);
  return new Date(2000, 0, 1, hour, minute).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
function joinNatural(values) { return values.length < 2 ? values[0] ?? "" : `${values.slice(0, -1).join(", ")} and ${values.at(-1)}`; }
