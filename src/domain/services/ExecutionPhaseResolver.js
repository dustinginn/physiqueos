export function resolveExecutionPhase(executionItem, localDate) {
  const date = String(localDate ?? "");
  const timeline = Array.isArray(executionItem?.timeline)
    ? executionItem.timeline
    : [];
  const current =
    timeline.find(
      (phase) =>
        phase.startDate <= date &&
        (!phase.endDate || date <= phase.endDate)
    ) ?? null;
  const next =
    timeline.find((phase) => phase.startDate > date) ?? null;

  return { current, next };
}

export const resolvePeptideDose = resolveExecutionPhase;

export function formatPeptideExecutionSummary(executionItem, localDate) {
  if (!executionItem) return "Not configured";
  const days = executionItem.cadence?.type === "daily"
    ? "Daily"
    : executionItem.cadence?.type === "every_x_days"
      ? `Every ${executionItem.cadence.interval ?? executionItem.preferredSchedule?.intervalDays ?? 1} days`
      : formatDays(executionItem.preferredSchedule?.daysOfWeek);
  const time = formatTime(executionItem.preferredSchedule?.timeOfDay);
  const { current } = resolveExecutionPhase(executionItem, localDate);
  const dose = formatPeptideDose(current?.dose);

  return [days, time, dose].filter(Boolean).join(" · ") || "Not configured";
}

export function formatPeptideDose(dose) {
  if (!dose?.amount || !dose?.unit) return "";
  const amount = String(dose.amount).replace(/^(-?)\./, "$10.");
  return `${amount} ${dose.unit}`;
}

function formatDays(days = []) {
  const short = {
    sunday: "Sun",
    monday: "Mon",
    tuesday: "Tue",
    wednesday: "Wed",
    thursday: "Thu",
    friday: "Fri",
    saturday: "Sat",
  };
  const labels = days.map((day) => short[day]).filter(Boolean);

  return labels.join(",") === "Sun,Mon,Tue,Wed,Thu"
    ? "Sun–Thu"
    : labels.join(", ");
}

function formatTime(value) {
  if (/^\d{2}:\d{2}$/.test(value ?? "")) {
    const [hour, minute] = value.split(":").map(Number);
    return new Date(2000, 0, 1, hour, minute).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return String(value ?? "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
