export function orderWeeklyAveragesNewestFirst(weeks = []) {
  const rolling = [];
  const dated = [];

  weeks.forEach((week, index) => {
    const normalized = {
      index,
      week,
      sortDate: resolveWeeklyAverageSortDate(week),
    };

    if (isCurrentRollingWeek(week)) {
      rolling.push(normalized);
    } else {
      dated.push(normalized);
    }
  });

  return [
    ...rolling.sort((a, b) => a.index - b.index),
    ...dated.sort((a, b) => {
      const left = b.sortDate ?? "";
      const right = a.sortDate ?? "";

      if (left !== right) return left.localeCompare(right);

      return a.index - b.index;
    }),
  ].map((entry) => entry.week);
}

function isCurrentRollingWeek(week = {}) {
  return /current\s+rolling\s+7\s+days/i.test(
    String(week.label ?? week.title ?? week.week ?? "")
  );
}

function resolveWeeklyAverageSortDate(week = {}) {
  const explicit =
    week.sortDate ??
    week.startDate ??
    week.weekStart ??
    week.date ??
    parseDateFromLabel(week.week) ??
    parseDateFromPeriod(week.period);

  return normalizeDateKey(explicit);
}

function parseDateFromPeriod(period) {
  const first = String(period ?? "").split("-")[0]?.trim();

  return parseDateFromLabel(first);
}

function parseDateFromLabel(label) {
  const text = String(label ?? "").trim();
  const match = text.match(/(?:week\s+of\s+)?([A-Za-z]{3,9})\s+(\d{1,2})/i);

  if (!match) return null;

  const monthIndex = MONTHS[match[1].slice(0, 3).toLowerCase()];
  const day = Number(match[2]);

  if (!Number.isFinite(monthIndex) || !Number.isFinite(day)) return null;

  return `2000-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalizeDateKey(value) {
  if (!value) return null;

  const text = String(value).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  return null;
}

const MONTHS = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};
