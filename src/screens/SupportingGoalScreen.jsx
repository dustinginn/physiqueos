import {
  Activity,
  Camera,
  Dumbbell,
  ShieldCheck,
  TrendingDown,
} from "lucide-react";
import { FounderRepositories } from "../data/repositories/founderRepositories";
import { GoalEvaluationService } from "../domain/services/GoalEvaluationService";
import { createTrainingPerformanceIntelligenceReport } from "../domain/services/TrainingPerformanceIntelligenceService";

const GOAL_IDS = {
  maintenance: "goal_maintain_8_9_body_fat",
  leanMass: "goal_preserve_lean_mass",
};

const configs = {
  maintenance: {
    id: GOAL_IDS.maintenance,
    title: "Maintain 8-9% Body Fat",
    statusFallback: "Entering Target Range",
    icon: ShieldCheck,
    color: "success",
    explanation:
      "This objective supports the primary visible-abs goal by ensuring the end state is maintainable, not just temporarily achieved.",
    objectives: [
      "Reach estimated 8-9% body-fat range",
      "Avoid over-cutting",
      "Stabilize weight after the cut",
      "Preserve performance and recovery",
    ],
    coach:
      "Maintenance is about transitioning from fat loss to stability once the primary goal is achieved. The evidence supports continued progress toward the range, but this should not become a second aggressive cut. The next phase is about arriving lean, then proving the result can be held.",
  },
  leanMass: {
    id: GOAL_IDS.leanMass,
    title: "Preserve Lean Mass",
    statusFallback: "Stable",
    icon: Dumbbell,
    color: "effort",
    explanation:
      "This objective protects the quality of the cut. Fat loss is only successful if lean mass, strength, and visual muscularity are preserved as much as possible.",
    objectives: [
      "Preserve DEXA lean mass as much as possible",
      "Maintain resistance training quality",
      "Maintain high protein intake",
      "Watch recovery and excessive fatigue",
    ],
    coach:
      "DEXA remains the highest-confidence lean-mass evidence. Progress photos can support confidence when muscularity and fullness appear preserved, but they do not replace scan evidence. The current picture supports preservation, while the next DEXA remains the cleanest confirmation point.",
  },
};

export async function getSupportingGoalDossier(goalKey) {
  const resolvedGoalKey = configs[goalKey] ? goalKey : "maintenance";
  const config = configs[resolvedGoalKey];
  const data = await getSupportingGoalData(config, resolvedGoalKey);
  return { config, data, goalKey: resolvedGoalKey };
}

async function getSupportingGoalData(config, goalKey) {
  const user = await FounderRepositories.users.getCurrentUser();
  const userId = user?.id;
  const [
    goals,
    dexaScans,
    weightEntries,
    progressPhotos,
    protocols,
    nutritionContext,
    analyses,
    canonicalEvidence,
  ] = await Promise.all([
    FounderRepositories.goals.listGoals(userId),
    FounderRepositories.dexaScans.listDEXAScans(userId),
    FounderRepositories.weights.listWeightEntries(userId),
    FounderRepositories.progressPhotos.listPhotos(userId),
    FounderRepositories.protocols.listActiveProtocols(userId),
    FounderRepositories.nutritionContext.getNutritionContext(userId),
    FounderRepositories.analyses.listAnalyses(),
    FounderRepositories.canonicalEvidence.listCanonicalEvidenceObjects(userId),
  ]);
  const sortedDEXA = sortByDate(dexaScans, "measuredAt");
  const sortedWeights = sortByDate(weightEntries, "measuredAt");
  const trainingPerformance = createTrainingPerformanceIntelligenceReport({ canonicalObjects: canonicalEvidence });
  const evaluations = GoalEvaluationService.getGoalEvaluations({
    goals,
    dexaScans: sortedDEXA,
    weightEntries: sortedWeights,
    progressPhotos,
    protocols,
    nutritionContext,
    photoAnalyses: analyses,
    trainingPerformance,
  });
  const evaluation = evaluations.find((item) => item.goalId === config.id);

  return {
    status: evaluation?.presentation?.status ?? evaluation?.current ?? config.statusFallback,
    confidence: evaluation?.confidence ?? 0,
    confidenceLabel: getConfidenceLabel(evaluation?.confidence ?? 0),
    evidence:
      goalKey === "leanMass"
        ? getLeanMassEvidence({ sortedDEXA, progressPhotos, nutritionContext })
        : getMaintenanceEvidence({ sortedDEXA, sortedWeights, progressPhotos }),
    protocols:
      goalKey === "leanMass"
        ? getLeanMassProtocols({ protocols, nutritionContext })
        : getMaintenanceProtocols({ protocols, nutritionContext }),
    sourceFacts: {
      dexaScans: sortedDEXA.map((scan) => ({ date: scan.measuredAt, bodyFat: scan.bodyFatPercentage, leanMass: scan.leanMass?.value ?? null, unit: scan.leanMass?.unit ?? "lb" })),
      weights: sortedWeights.map((entry) => ({ date: entry.measuredAt, value: entry.weight?.value ?? null, unit: entry.weight?.unit ?? "lb" })),
      photoDates: progressPhotos.map((photo) => photo.capturedAt ?? photo.date).filter(Boolean).sort(),
      trainingGeneratedAt: trainingPerformance.generated_at ?? null,
    },
  };
}

function getMaintenanceEvidence({ sortedDEXA, sortedWeights, progressPhotos }) {
  const latestDEXA = sortedDEXA.at(-1);
  const previousDEXA = sortedDEXA.at(-2);
  const latestWeight = sortedWeights.at(-1);
  const firstWeight = sortedWeights[0];
  const bodyFatChange =
    latestDEXA && previousDEXA
      ? Number((latestDEXA.bodyFatPercentage - previousDEXA.bodyFatPercentage).toFixed(1))
      : null;

  return [
    {
      icon: ShieldCheck,
      color: "evidence",
      title: "DEXA trend",
      detail:
        bodyFatChange !== null
          ? `Latest DEXA is ${latestDEXA.bodyFatPercentage.toFixed(1)}%, down ${Math.abs(bodyFatChange).toFixed(1)} points from the prior scan.`
          : "DEXA remains the calibration source for body-fat range.",
    },
    {
      icon: TrendingDown,
      color: "success",
      title: "Weight trend",
      detail:
        latestWeight && firstWeight
          ? `Weight has moved from ${firstWeight.weight.value.toFixed(1)} to ${latestWeight.weight.value.toFixed(1)} ${latestWeight.weight.unit}, supporting movement toward the target range.`
          : "Weight trend is still building.",
    },
    {
      icon: Camera,
      color: "effort",
      title: "Visual trend",
      detail:
        progressPhotos.length > 0
          ? "Progress photos support visible definition and help confirm whether the range is becoming visually maintainable."
          : "Progress photos will add visual validation when available.",
    },
    {
      icon: Activity,
      color: "primary",
      title: "Estimated current range",
      detail:
        "Current body fat between scans remains estimated from DEXA and weight trend, so the goal is progress toward the range rather than claiming maintenance yet.",
    },
  ];
}

function getLeanMassEvidence({ sortedDEXA, progressPhotos, nutritionContext }) {
  const latestDEXA = sortedDEXA.at(-1);
  const previousDEXA = sortedDEXA.at(-2);
  const leanMassChange =
    latestDEXA?.leanMass?.value && previousDEXA?.leanMass?.value
      ? Number((latestDEXA.leanMass.value - previousDEXA.leanMass.value).toFixed(1))
      : null;
  const protein = nutritionContext?.proteinTarget;

  return [
    {
      icon: ShieldCheck,
      color: "evidence",
      title: "DEXA lean-mass trend",
      detail:
        leanMassChange !== null
          ? `Latest DEXA shows ${latestDEXA.leanMass.value.toFixed(1)} ${latestDEXA.leanMass.unit} lean mass, ${leanMassChange.toFixed(1)} ${latestDEXA.leanMass.unit} from the prior scan.`
          : "DEXA is the highest-confidence lean-mass evidence.",
    },
    {
      icon: Camera,
      color: "effort",
      title: "Visual retention",
      detail:
        progressPhotos.length > 0
          ? "Progress photos suggest a strong muscle-retention appearance, especially through V-taper, shoulders, and back definition."
          : "Progress photos will support visual retention assessment when available.",
    },
    {
      icon: Dumbbell,
      color: "success",
      title: "Training consistency",
      detail:
        "Resistance training quality remains an important supporting signal, but it should not replace DEXA confirmation.",
    },
    {
      icon: Activity,
      color: "primary",
      title: "Protein and recovery",
      detail:
        protein?.value
          ? `Protein target is ${protein.value}${protein.unit ?? "g"}, with recovery monitored for excessive fatigue.`
          : "Protein intake and recovery context support interpretation when logged.",
    },
  ];
}

function getMaintenanceProtocols({ protocols, nutritionContext }) {
  return [
    nutritionContext?.estimatedDailyCaloricIntake && {
      title: "Nutrition plan",
      detail: "Current intake range supports the planned deficit without turning maintenance into a second aggressive cut.",
    },
    protocols.find((protocol) => protocol.name === "Retatrutide") && {
      title: "Retatrutide",
      detail: "Relevant as appetite and adherence context, but not treated as direct body-fat evidence.",
    },
    {
      title: "Training consistency",
      detail: "Training and daily activity support the transition from fat loss to stability.",
    },
  ].filter(Boolean);
}

function getLeanMassProtocols({ protocols, nutritionContext }) {
  return [
    protocols.find((protocol) => protocol.name === "Tesamorelin") && {
      title: "Tesamorelin",
      detail: "Relevant lean-mass preservation context during the cut.",
    },
    nutritionContext?.proteinTarget && {
      title: "Protein target",
      detail: "Protein supports the preservation objective when adherence is logged.",
    },
    {
      title: "Resistance training",
      detail: "Training quality is core supporting context for preserving muscle.",
    },
    {
      title: "Recovery work",
      detail: "Recovery helps protect performance as the cut gets leaner.",
    },
  ].filter(Boolean);
}

function sortByDate(records, field) {
  return [...records].sort((a, b) => String(a[field]).localeCompare(String(b[field])));
}

function getConfidenceLabel(confidence) {
  if (confidence >= 80) return "High Confidence";
  if (confidence >= 55) return "Moderate Confidence";

  return "Building Confidence";
}
