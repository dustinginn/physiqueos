import { createMidweekConfidencePresentation } from "./BriefingGoalConfidencePresentationService";
import { createMidweekEditorialNarrative } from "./MidweekBriefingEditorialService";

export function prepareMidweekBriefingReviewPresentation({ artifact } = {}) {
  if (!artifact?.briefing) return null;
  const briefing = artifact.briefing;
  const editorial = createMidweekEditorialNarrative({
    energyBalance: briefing.energyBalance,
    training: briefing.training,
  });
  const energyPresentation = createMidweekEnergyPresentation(briefing.energyBalance);
  return {
    ...briefing,
    hero: { ...briefing.hero, ...editorial.hero },
    training: {
      ...briefing.training,
      interpretation: editorial.trainingInterpretation,
      watch: editorial.trainingWatch,
    },
    energyBalance: {
      ...briefing.energyBalance,
      ...energyPresentation,
    },
    coachTake: editorial.coachTake,
    goalConfidence: createMidweekConfidencePresentation(
      briefing.goalConfidence,
      { briefing }
    ),
  };
}

export function createMidweekEnergyPresentation(energy = {}) {
  const chartPoints = Array.isArray(energy.chartPoints) ? energy.chartPoints : [];
  const complete = chartPoints.filter((point) => point.complete);
  const missing = chartPoints.filter((point) => !point.complete);
  const conclusion = ({
    probably_below: "Intake is below estimated expenditure",
    probably_above: "Intake is above estimated expenditure",
    roughly_at: "Intake and expenditure are close",
    unclear: "More food and activity data needed",
  })[energy.balanceDirection] ?? "More food and activity data needed";
  const amount = Math.abs(Math.round(Number(energy.estimatedDailyBalanceMidpoint)));
  const balanceHeadline = !Number.isFinite(amount)
    ? "No daily estimate yet"
    : amount < 25
      ? "About even day to day"
      : `${amount.toLocaleString("en-US")} kcal/day ${energy.estimatedDailyBalanceMidpoint < 0 ? "below" : "above"}`;
  let interpretation;
  if (!complete.length) {
    interpretation = "Food or activity is missing for each day so far. Keep the plan steady and fill in what you can before Sunday.";
  } else {
    const days = complete.map((point) => longDay(point.date));
    const dayText = days.length === 1 ? days[0]
      : days.length === 2 ? `${days[0]} and ${days[1]}`
        : `${days.slice(0, -1).join(", ")}, and ${days.at(-1)}`;
    const missingText = missing.length
      ? ` ${longDay(missing[0].date)} is missing data, which is another reason to wait for Sunday’s review.`
      : "";
    interpretation = energy.balanceDirection === "probably_below"
      ? `${dayText} ${days.length === 1 ? "suggests" : "suggest"} you’re still below maintenance.${missingText} Keep calories steady for now.`
      : `${dayText} look close to maintenance.${missingText} Keep calories steady for now.`;
  }
  return Object.freeze({
    headline: conclusion,
    balanceHeadline,
    interpretation,
    comparisonNarrative: energyComparisonText(energy),
    chartTitle: "Energy Balance, Sunday–Tuesday",
  });
}

function energyComparisonText(energy) {
  const previous = energy.comparison?.averageBalance;
  const current = Number.isFinite(energy.estimatedAverageDailyBalance)
    ? energy.estimatedAverageDailyBalance
    : energy.estimatedDailyBalanceMidpoint;
  if (!Number.isFinite(previous) || !Number.isFinite(current)) {
    return "The prior comparable period does not have enough paired evidence for a directional comparison.";
  }
  const change = Math.round(current - previous);
  const direction = Math.abs(change) < 25 ? "was similar to" : change > 0 ? "was higher than" : "was lower than";
  const rmr = energy.rmrProvenance?.sourceDexaDate
    ? ` Estimated expenditure uses the DEXA RMR available on ${shortDate(energy.rmrProvenance.sourceDexaDate)} plus active calories.`
    : " Estimated expenditure is limited because an eligible RMR source is unavailable.";
  return `Average estimated balance ${direction} the prior comparable period by ${Math.abs(change).toLocaleString("en-US")} kcal/day.${rmr}`;
}

function longDay(value) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" })
    .format(new Date(`${value}T12:00:00Z`));
}

function shortDate(value) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T12:00:00Z`));
}
