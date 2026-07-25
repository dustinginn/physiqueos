import { FounderRepositories } from "../../data/repositories/founderRepositories";
import { getActivityTimelineReport } from "./ActivityEvidenceContextService";
import { EVIDENCE_CONTEXT_WINDOWS } from "./EvidenceContextWindows";
import { reconcileEnergyDays } from "./EnergyDailyReconciliationService";
import { aggregateEnergyWeeks } from "./EnergyWeeklyAggregationService";
import { getRecentFourWeeklyEnergy } from "./EnergyWeeklyRangeService";
import { getNutritionTimelineReport } from "./NutritionEvidenceContextService";
import { getTrainingEvidenceContext } from "./TrainingEvidenceContextService";

const VALID_CONTEXTS = new Set(["build-lean-mass", "visible-abs", "all"]);

export async function getEnergyEvidenceReport({
  context,
  currentPath = "/progress/energy",
  currentDate = new Date(),
  repositories = FounderRepositories,
} = {}) {
  const contextId = VALID_CONTEXTS.has(context) ? context : "build-lean-mass";
  const user = await repositories.users.getCurrentUser();
  const [nutrition, activity, dexaScans, baseTimeline] = await Promise.all([
    getNutritionTimelineReport({ context: "all", currentDate, repositories }),
    getActivityTimelineReport({ context: "all", currentDate, repositories }),
    repositories.dexaScans.listDEXAScans(user?.id),
    getTrainingEvidenceContext({ context: contextId, currentDate, repositories }),
  ]);
  const reconciliationInputs = {
    nutritionDays: nutrition.report.nutritionDays,
    activityDays: activity.report.activityHistory,
    dexaScans,
  };
  const allDays = reconcileEnergyDays(reconciliationInputs);
  const window = EVIDENCE_CONTEXT_WINDOWS[contextId];
  const currentDateKey = localDate(currentDate);
  const endDate =
    contextId === "build-lean-mass"
      ? currentDateKey
      : window.endDate ?? allDays.at(-1)?.date ?? currentDateKey;
  const startDate = window.startDate ?? allDays.at(0)?.date ?? null;
  const scopedEvidenceDays = allDays.filter(
    (day) =>
      (!startDate || day.date >= startDate) && (!endDate || day.date <= endDate)
  );
  const calendarDates =
    contextId === "all" || scopedEvidenceDays.length === 0
      ? []
      : createDateRange(
          scopedEvidenceDays.at(0).date,
          scopedEvidenceDays.at(-1).date
        );
  const days =
    calendarDates.length === 0
      ? scopedEvidenceDays
      : reconcileEnergyDays({ ...reconciliationInputs, calendarDates }).filter(
          (day) =>
            day.date >= calendarDates[0] &&
            day.date <= calendarDates.at(-1)
        );
  const weeks = aggregateEnergyWeeks({ days, startDate, endDate });

  return Object.freeze({
    timeline: Object.freeze({
      ...baseTimeline,
      currentPath,
      selectedLabel:
        contextId === "all" ? "All Energy" : baseTimeline.selectedLabel,
      options: baseTimeline.options.map((option) => ({
        ...option,
        label: option.id === "all" ? "All Energy" : option.label,
      })),
    }),
    summary: createSummary(days),
    days: Object.freeze([...days].reverse()),
    weeks: Object.freeze([...weeks].reverse()),
    recentFourWeeks: Object.freeze(
      getRecentFourWeeklyEnergy(weeks).map((week) => week)
    ),
    latestEvidenceDate: days.at(-1)?.date ?? null,
    dataSources: Object.freeze([
      { name: "Nutrition", status: "Connected" },
      { name: "Activity", status: "Connected" },
      { name: "DEXA", status: "Connected" },
      { name: "Apple Health", status: "Suggested" },
    ]),
    audit: createAudit(allDays),
  });
}

export function createEnergyPresentation({ days = [], weeks = [] } = {}) {
  return {
    summary: createSummary(days),
    days: [...days].reverse(),
    weeks: [...weeks].reverse(),
  };
}

function createSummary(days) {
  const intake = days.filter((day) => day.calorieIntake != null);
  const expenditure = days.filter((day) => day.estimatedExpenditure != null);
  const complete = days.filter((day) => day.energyBalance != null);

  return Object.freeze({
    averageIntake: average(intake.map((day) => day.calorieIntake)),
    averageExpenditure: average(
      expenditure.map((day) => day.estimatedExpenditure)
    ),
    averageBalance: average(complete.map((day) => day.energyBalance)),
    completeDays: complete.length,
    evidenceDays: days.length,
  });
}

function createAudit(days) {
  const nutrition = days.filter((day) => day.nutritionDayId);
  const activity = days.filter((day) => day.activityDayId);
  return Object.freeze({
    nutritionDays: nutrition.length,
    activityDays: activity.length,
    overlappingDates: days.filter(
      (day) => day.nutritionDayId && day.activityDayId
    ).length,
    completePairedDays: days.filter((day) => day.completeness === "complete")
      .length,
    nutritionOnlyDates: days.filter(
      (day) => day.completeness === "nutrition-only"
    ).length,
    activityOnlyDates: days.filter((day) => day.completeness === "activity-only")
      .length,
    missingRmrDates: days.filter(
      (day) => day.completeness === "missing-rmr"
    ).length,
    estimatedExpenditureDays: days.filter(
      (day) => day.expenditureKind === "estimated_rmr_plus_active"
    ).length,
  });
}

function average(values) {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function localDate(value) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Los_Angeles",
    year: "numeric",
  }).format(value);
}

function createDateRange(startDate, endDate) {
  const dates = [];
  const cursor = new Date(`${startDate}T12:00:00Z`);
  const end = new Date(`${endDate}T12:00:00Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}
