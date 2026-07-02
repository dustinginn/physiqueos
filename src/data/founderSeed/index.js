import { founderAnalyses } from "./analyses";
import { founderAdaptiveTrustProfile } from "./adaptiveTrustProfile";
import { founderDailyCheckIns } from "./dailyCheckIns";
import { founderDailyBriefings } from "./dailyBriefings";
import { founderDEXAScans } from "./dexaScans";
import { founderGoals } from "./goals";
import { founderMilestones } from "./milestones";
import { founderNutritionContext } from "./nutritionContext";
import { founderOperatingPlan } from "./operatingPlan";
import { founderOperatingRhythm } from "./operatingRhythm";
import { founderProgressPhotos } from "./progressPhotos";
import { founderProtocols } from "./protocols";
import { founderReminders } from "./reminders";
import { founderUser } from "./user";
import { founderWeightEntries } from "./weights";

export const founderSeedPack = {
  version: "founder-seed-v2",
  importedAt: null,
  user: founderUser,
  goals: founderGoals,
  weightEntries: founderWeightEntries,
  dexaScans: founderDEXAScans,
  protocols: founderProtocols,
  reminders: founderReminders,
  nutritionContext: founderNutritionContext,
  operatingPlan: founderOperatingPlan,
  operatingRhythm: founderOperatingRhythm,
  adaptiveTrustProfile: founderAdaptiveTrustProfile,
  milestones: founderMilestones,
  progressPhotos: founderProgressPhotos,
  dailyCheckIns: founderDailyCheckIns,
  dailyBriefings: founderDailyBriefings,
  analyses: founderAnalyses,
};
