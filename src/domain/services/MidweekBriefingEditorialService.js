import {
  auditPIEditorialVoice,
  coachMovementLanguage,
} from "./PIEditorialTranslationService";
import {
  resolveUserFacingObjectLanguage,
} from "./UserFacingObjectLanguageService";

export function createMidweekEditorialNarrative({
  energyBalance,
  training,
} = {}) {
  const hasHighlight = Boolean(training?.highlights?.[0]);
  const belowMaintenance =
    Number(energyBalance?.estimatedDailyBalanceMidpoint) < 0;
  const movement = coachMovementLanguage(training?.highlights?.[0]?.exercise);
  const narrative = {
    hero: {
      verdict: belowMaintenance
        ? "Calories are moving closer to supporting stronger training."
        : "Calories are in range to support stronger training.",
      summary: `${hasHighlight
        ? "Lower-body training produced the strongest performance of the week."
        : "Your training rhythm is taking shape."} ${belowMaintenance
        ? "Intake still appears slightly below maintenance"
        : "Intake appears close to maintenance"}, so keep logging through Saturday and wait for Sunday’s full review before changing calories.`,
    },
    trainingInterpretation: hasHighlight
      ? `${capitalize(movement)} produced the week’s strongest performance. That is the kind of progression we want while building muscle.`
      : training?.interpretation,
    coachTake: {
      biggestTakeaway: hasHighlight
        ? `${capitalize(movement)} is progressing the way we want while building muscle. Protect that momentum instead of reacting to a few days of calorie math.`
        : "The important thing this week is establishing a training rhythm we can build on. There is nothing here that calls for an early change.",
      recommendation:
        "Keep calories and activity steady through Sunday. The full week will give us a better basis for deciding whether intake needs to change.",
    },
    trainingWatch: normalizeMidweekTrainingWatch(training?.watch),
  };
  const audit = auditPIEditorialVoice([
    narrative.hero.verdict,
    narrative.hero.summary,
    narrative.trainingInterpretation,
    narrative.coachTake.biggestTakeaway,
    narrative.coachTake.recommendation,
  ], {
    internalObjectNames: (training?.highlights ?? []).map(
      (item) => item.exercise
    ),
  });
  if (!audit.passes) {
    throw new Error(
      `Midweek editorial narration failed: ${audit.issues
        .map((issue) => issue.text)
        .join(" | ")}`
    );
  }
  return narrative;
}

export function normalizeMidweekTrainingWatch(items = []) {
  return (items ?? []).map((item) => ({
    ...item,
    message: createMidweekExerciseWatchNarrative({
      exercise: item.exercise,
      status: item.status,
      percentChange: percentFromMessage(item.message),
    }),
  }));
}

export function createMidweekExerciseWatchNarrative({
  exercise,
  status,
  percentChange = null,
} = {}) {
  const language = resolveUserFacingObjectLanguage({
    objectType: "exercise",
    displayName: exercise,
    specificity: "specific",
    narrativeContext: "midweek_training_watch",
  });
  const subject = capitalize(language.sentenceReference);
  if (status === "regressing") {
    const amount = Number.isFinite(percentChange)
      ? ` ${Math.abs(percentChange).toFixed(1)}%`
      : "";
    return `${subject} dropped${amount} from its previous session. Check recovery and execution before adding load.`;
  }
  return `${subject} ${language.agreement.have} been stable for several sessions. Consider increasing difficulty before adding more of the same work.`;
}

function capitalize(value) {
  return `${String(value ?? "").charAt(0).toUpperCase()}${String(value ?? "").slice(1)}`;
}

function percentFromMessage(value) {
  const match = String(value ?? "").match(/(\d+(?:\.\d+)?)%/);
  return match ? Number(match[1]) : null;
}
