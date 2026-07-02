import { createAnalysisRepository } from "./AnalysisRepository";
import { createAdaptiveTrustRepository } from "./AdaptiveTrustRepository";
import { createDailyCheckInRepository } from "./DailyCheckInRepository";
import { createDailyBriefingRepository } from "./DailyBriefingRepository";
import { createDEXARepository } from "./DEXARepository";
import { createGoalRepository } from "./GoalRepository";
import { createMilestoneRepository } from "./MilestoneRepository";
import { createNutritionContextRepository } from "./NutritionContextRepository";
import { createOperatingPlanRepository } from "./OperatingPlanRepository";
import { createOperatingRhythmRepository } from "./OperatingRhythmRepository";
import { createProgressPhotoRepository } from "./ProgressPhotoRepository";
import { createProtocolRepository } from "./ProtocolRepository";
import { createReminderRepository } from "./ReminderRepository";
import { createUserRepository } from "./UserRepository";
import { createWeightRepository } from "./WeightRepository";

export function createSeedRepositories(seedPack, options = {}) {
  return {
    users: createUserRepository(seedPack.user, options),
    goals: createGoalRepository(seedPack.goals, options),
    weights: createWeightRepository(seedPack.weightEntries, options),
    dexaScans: createDEXARepository(seedPack.dexaScans, options),
    protocols: createProtocolRepository(seedPack.protocols, options),
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
      options
    ),
    analyses: createAnalysisRepository(seedPack.analyses, options),
  };
}
