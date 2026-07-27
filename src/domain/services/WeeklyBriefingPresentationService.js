import { createPINarrativeAssessment } from "./PINarrativeAssessmentService";
import { createWeeklyTrainingPresentationModel } from "./WeeklyTrainingPresentationService";
import { selectWeeklyNarrativePresentation } from "./WeeklyNarrativePresentationSelector";

export function createWeeklyEnergyProgressModel(assessment) {
  if (!assessment?.dailyRecords?.length) return null;
  return {
    title: "Energy Balance",
    chart: {
      title: "Daily intake vs estimated expenditure",
      points: assessment.dailyRecords.map((record) => ({
        date: record.date,
        label: shortDay(record.date),
        intake: finiteOrNull(record.calorieIntake),
        expenditure: finiteOrNull(record.estimatedExpenditure),
        balance: finiteOrNull(record.energyBalance),
        complete: record.eligibility?.paired === true,
      })),
    },
    averageIntake: finiteOrNull(assessment.intake?.average),
    averageExpenditure: finiteOrNull(assessment.estimatedExpenditure?.average),
    averageBalance: finiteOrNull(assessment.netBalance?.average),
    pairedDayCount: assessment.coverage?.pairedDayCount ?? 0,
    eligibleDayCount: assessment.coverage?.eligibleDayCount ?? assessment.dailyRecords.length,
    provenance: {
      source: "canonical_closed_window_energy_assessment",
      window: assessment.window,
      calculationMethod: assessment.provenance?.calculationMethod ?? null,
    },
  };
}

export async function adaptWeeklyArtifactForPresentation({
  artifact,
  timeZone = "America/Los_Angeles",
} = {}) {
  const narrative = artifact?.briefing?.weeklyNarrative;
  if (!narrative) return artifact;
  const training = narrative.cards?.progress?.training;
  const window = artifact.evidenceWindow ?? {
    startDate: narrative.weekStart,
    endDate: narrative.weekEnd,
    timeZone,
  };
  const energy = narrative.cards?.progress?.energy
    ?? createWeeklyEnergyPresentationFromArtifact(narrative, window);
  const trainingPresentation = training?.presentation ?? createWeeklyTrainingPresentationModel({
    window,
    trainingDays: training?.completedDays ?? 0,
    piObservations: narrative.context?.pi?.observations ?? [],
    context: narrative.context,
    energy,
  });
  const narrativeAssessment = isCanonicalAssessment(narrative.narrativeAssessment)
    ? narrative.narrativeAssessment
    : createPINarrativeAssessment({
        observations: narrative.context?.pi?.observations ?? [],
        claims: (narrative.context?.pi?.rankedClaims?.rankedCandidates ?? [])
          .map((item) => item.candidate ?? item),
        goal: narrative.context?.activeGoal ?? narrative.context?.activeGoalSummary ?? {},
        phase: narrative.context?.activePhase ?? {},
        operatingState:
          narrative.context?.operatingState?.value ??
          narrative.context?.operatingState ??
          null,
        evidenceWindow: window,
        evidenceCutoff: narrative.goalConfidence?.evidenceCutoff ?? null,
        timeZone,
        confidence: narrative.goalConfidence,
        bodyComposition: narrative.context?.latestCompletedDexa ?? null,
      });
  const narrativePresentationSelection = selectWeeklyNarrativePresentation({
    assessment: narrativeAssessment,
    facts: {
      domains: createWeeklyDomainFacts(narrative, trainingPresentation, energy),
      training: {
        categories: trainingPresentation.categorySummaries,
      },
    },
    confidence: narrative.goalConfidence,
    period: {
      startDate: window?.startDate ?? narrative.weekStart,
      endDate: window?.endDate ?? narrative.weekEnd,
      timeZone,
    },
    navigation: {
      backHref: "/briefings/review",
      backLabel: "Briefing History",
    },
  });
  return {
    ...artifact,
    briefing: {
      ...artifact.briefing,
      weeklyNarrative: {
        ...narrative,
        narrativeAssessment,
        narrativePresentationSelection,
        cards: {
          ...narrative.cards,
          snapshot: {
            ...narrative.cards?.snapshot,
            presentation: createWeeklySnapshotPresentation(narrative, energy),
          },
          progress: {
            ...narrative.cards?.progress,
            energy,
            training: {
              ...training,
              presentation: trainingPresentation,
            },
          },
        },
      },
    },
  };
}

export function createWeeklyEnergyPresentationFromArtifact(narrative, window) {
  const observations = narrative?.context?.pi?.observations ?? [];
  const candidates = narrative?.context?.pi?.rankedClaims?.rankedCandidates ?? [];
  const summary = candidates
    .map((item) => item?.candidate?.explanationData?.current)
    .find((item) => item?.intake && item?.estimatedExpenditure && item?.netBalance);
  const byKind = new Map(observations
    .filter((item) => item.domain === "energy")
    .map((item) => [item.kind, item]));
  const coverage = summary?.coverage ?? byKind.get("paired_day_coverage")?.explanationData;
  const averageIntake = finiteOrNull(
    summary?.intake?.average ??
    byKind.get("energy_intake")?.explanationData?.currentAverage
  );
  const averageExpenditure = finiteOrNull(
    summary?.estimatedExpenditure?.average ??
    byKind.get("energy_expenditure")?.explanationData?.currentAverage
  );
  const averageBalance = finiteOrNull(
    summary?.netBalance?.average ??
    byKind.get("energy_balance")?.explanationData?.currentAverage
  );
  if (![averageIntake, averageExpenditure, averageBalance].some(Number.isFinite)) return null;
  const evidenceIds = unique([
    ...(summary?.intake?.evidenceIds ?? []),
    ...(summary?.activity?.evidenceIds ?? []),
    ...(byKind.get("paired_day_coverage")?.supportingEvidenceIds ?? []),
  ]);
  const nutritionDates = evidenceDates(evidenceIds, "nutrition");
  const activityDates = evidenceDates(evidenceIds, "activity_day");
  return {
    title: "Energy Balance",
    chart: {
      title: "Daily Energy coverage",
      summaryOnly: true,
      averageIntake,
      averageExpenditure,
      averageBalance,
      pairedDayCount: coverage?.pairedDayCount ?? coverage?.estimatedExpenditureDays ?? 0,
      eligibleDayCount: coverage?.eligibleDayCount ?? coverage?.evidenceDays ?? 7,
      points: dateRange(window?.startDate, window?.endDate).map((date) => ({
        date,
        label: shortDay(date),
        intake: null,
        expenditure: null,
        balance: null,
        complete: nutritionDates.has(date) && activityDates.has(date),
      })),
    },
    averageIntake,
    averageExpenditure,
    averageBalance,
    pairedDayCount: coverage?.pairedDayCount ?? coverage?.estimatedExpenditureDays ?? 0,
    eligibleDayCount: coverage?.eligibleDayCount ?? coverage?.evidenceDays ?? 7,
    completePairedDayCount:
      coverage?.completePairedDayCount ??
      coverage?.completePairedDays ??
      0,
    partialPairedDayCount:
      coverage?.partialPairedDayCount ??
      coverage?.partialDays ??
      0,
    dailyValuesUnavailable: true,
    provenance: {
      source: "artifact_owned_pi_energy_summary",
      window,
      calculationMethod: "canonical_reconciled_rmr_plus_active",
    },
  };
}

function createWeeklyDomainFacts(narrative, training, energy) {
  const progress = narrative.cards?.progress ?? {};
  const weight = progress.weight;
  return {
    training: {
      domain: "training",
      icon: "💪",
      label: "Training",
      detail: `${training?.trainingDayCount ?? progress.training?.completedDays ?? 0} days · ${training?.counts?.improving ?? 0} improving · ${training?.counts?.plateauing ?? 0} plateauing`,
      evidenceCount: training?.comparableCategoryCount ?? 0,
      destination: "/progress/training",
    },
    energy: {
      domain: "energy",
      icon: "🔥",
      label: "Energy",
      detail: `${energy?.pairedDayCount ?? 0} of ${energy?.eligibleDayCount ?? 7} days with food and activity`,
      evidenceCount: energy?.pairedDayCount ?? 0,
      destination: "/progress/energy",
    },
    weight: {
      domain: "weight",
      icon: "⚖️",
      label: "Weight",
      detail: Number.isFinite(weight?.weeklyAverage)
        ? `${weight.weeklyAverage.toFixed(1)} lb average${Number.isFinite(weight?.change) ? ` · ${weight.change >= 0 ? "+" : ""}${weight.change.toFixed(1)} lb first to last` : ""}`
        : "",
      evidenceCount: weight?.points?.length ?? 0,
      destination: "/progress/weight",
    },
    photos: {
      domain: "photos",
      icon: "📸",
      label: "Photos",
      detail: progress.photo ? "1 session" : "",
      evidenceCount: progress.photo ? 1 : 0,
      destination: progress.photo?.href ?? "/progress/photos",
    },
  };
}

function createWeeklySnapshotPresentation(narrative, energy) {
  const facts = (narrative.cards?.snapshot?.facts ?? [])
    .filter((fact) => !(fact.label === "DEXA" && /none|no /i.test(fact.value)));
  if (energy && !facts.some((fact) => /energy|nutrition/i.test(fact.label))) {
    facts.push({
      label: "Energy coverage",
      value: `${energy.pairedDayCount} of ${energy.eligibleDayCount} days with food and activity`,
    });
  }
  return { facts };
}

function evidenceDates(ids, prefix) {
  return new Set(ids
    .filter((id) => String(id).startsWith(`${prefix}|`))
    .map((id) => String(id).split("|")[1])
    .filter(Boolean));
}

function dateRange(startDate, endDate) {
  if (!startDate || !endDate) return [];
  const values = [];
  let cursor = new Date(`${startDate}T12:00:00Z`);
  const end = new Date(`${endDate}T12:00:00Z`);
  while (cursor <= end && values.length < 31) {
    values.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(cursor.getTime() + 86400000);
  }
  return values;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function shortDay(value) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`)).slice(0, 2);
}

function finiteOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isCanonicalAssessment(value) {
  return value?.modelVersion === "pi_narrative_assessment_v1";
}
