import { createAnalysisRepository } from "./AnalysisRepository";
import { createAdaptiveTrustRepository } from "./AdaptiveTrustRepository";
import { createCanonicalEvidenceRepository } from "./CanonicalEvidenceRepository";
import { createDailyCheckInRepository } from "./DailyCheckInRepository";
import { createDailyBriefingRepository } from "./DailyBriefingRepository";
import { createDEXARepository } from "./DEXARepository";
import { createEvidencePackageRepository } from "./EvidencePackageRepository";
import { createEnergyStrategyLinkRepository } from "./EnergyStrategyLinkRepository";
import { createExecutionItemRepository } from "./ExecutionItemRepository";
import { createGoalRepository } from "./GoalRepository";
import { createGoalTransitionRepository } from "./GoalTransitionRepository";
import { createGoalProtocolTransitionRepository } from "./GoalProtocolTransitionRepository";
import { createMilestoneRepository } from "./MilestoneRepository";
import { createNutritionContextRepository } from "./NutritionContextRepository";
import { createOperatingPlanRepository } from "./OperatingPlanRepository";
import { createOperatingRhythmRepository } from "./OperatingRhythmRepository";
import { createProgressPhotoRepository } from "./ProgressPhotoRepository";
import { createProtocolRepository } from "./ProtocolRepository";
import { createProtocolVersionRepository } from "./ProtocolVersionRepository";
import { createReminderRepository } from "./ReminderRepository";
import { createUserRepository } from "./UserRepository";
import { createWeightRepository } from "./WeightRepository";
import { createEvidenceReviewRepository } from "./EvidenceReviewRepository";
import { createTrainingPerformanceEventRepository } from "./TrainingPerformanceEventRepository";
import { createGoalConfidenceRepository } from "./GoalConfidenceRepository";
import {
  createBriefingReconciliationWorkItemRepository,
} from "./BriefingReconciliationWorkItemRepository";

export function createSeedRepositories(seedPack, options = {}) {
  const evidencePackages = seedPack.evidencePackages ?? [];

  return {
    users: createUserRepository(seedPack.user, options),
    goals: createGoalRepository(seedPack.goals, options),
    goalTransitionDrafts: createGoalTransitionRepository(
      seedPack.goalTransitionDrafts ?? [],
      { ...options, onChange: () => options.onChange?.("goalTransitionDrafts") }
    ),
    goalProtocolTransitionDrafts: createGoalProtocolTransitionRepository(
      seedPack.goalProtocolTransitionDrafts ?? [],
      { ...options, onChange: () => options.onChange?.("goalProtocolTransitionDrafts") }
    ),
    weights: createWeightRepository(seedPack.weightEntries, options),
    dexaScans: createDEXARepository(seedPack.dexaScans, options),
    protocols: createProtocolRepository(seedPack.protocols, options),
    protocolVersions: createProtocolVersionRepository(
      seedPack.protocolVersions ?? [],
      options
    ),
    energyStrategyLinks: createEnergyStrategyLinkRepository(seedPack.energyStrategyLinks ?? [], options),
    executionItems: createExecutionItemRepository(seedPack.executionItems ?? [], options),
    reminders: createReminderRepository(seedPack.reminders ?? [], options),
    nutritionContext: createNutritionContextRepository(
      seedPack.nutritionContext ?? null,
      options
    ),
    operatingPlan: createOperatingPlanRepository(
      seedPack.operatingPlan ?? null,
      options
    ),
    operatingRhythm: createOperatingRhythmRepository(
      seedPack.operatingRhythm ?? null
    ),
    adaptiveTrust: createAdaptiveTrustRepository(
      seedPack.adaptiveTrustProfile ?? null
    ),
    milestones: createMilestoneRepository(seedPack.milestones),
    progressPhotos: createProgressPhotoRepository(
      seedPack.progressPhotos ?? [],
      options
    ),
    dailyCheckIns: createDailyCheckInRepository(
      seedPack.dailyCheckIns,
      options
    ),
    dailyBriefings: createDailyBriefingRepository(
      seedPack.dailyBriefings ?? [],
      { ...options, onChange: () => options.onChange?.("dailyBriefings") }
    ),
    briefingReconciliationWorkItems:
      createBriefingReconciliationWorkItemRepository(
        seedPack.briefingReconciliationWorkItems ?? [],
        {
          ...options,
          onChange: () => options.onChange?.("briefingReconciliationWorkItems"),
        }
      ),
    analyses: createAnalysisRepository(seedPack.analyses, options),
    evidencePackages: createEvidencePackageRepository(
      evidencePackages,
      options
    ),
    evidenceReviews: createEvidenceReviewRepository(seedPack.evidenceReviews ?? [], options),
    trainingPerformanceEvents: createTrainingPerformanceEventRepository(
      seedPack.trainingPerformanceEvents ?? []
    ),
    goalConfidence: createGoalConfidenceRepository({
      snapshots: seedPack.goalConfidenceSnapshots ?? [],
      history: seedPack.goalConfidenceHistory ?? [],
      continuitySeeds: seedPack.goalConfidenceContinuitySeeds ?? [],
    }),
    canonicalEvidence: createCanonicalEvidenceRepository(
      seedPack.canonicalEvidenceObjects ?? [],
      { ...options, evidencePackages }
    ),
  };
}
