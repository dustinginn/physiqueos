import { createOperatingPlan } from "../../domain/models/operatingPlan";

const USER_ID = "user_founder_001";

export const founderOperatingPlan = createOperatingPlan({
  id: "operating_plan_founder_alpha",
  userId: USER_ID,
  primaryGoalId: "goal_visible_abs_at_rest",
  supportingObjectiveIds: [
    "goal_preserve_lean_mass",
    "goal_maintain_8_9_body_fat",
    "objective_nutrition",
    "objective_recovery",
  ],
  nutrition: {
    estimatedDailyCaloricIntake: {
      min: 1900,
      max: 2200,
      unit: "kcal",
    },
    proteinPriority: "high",
    preferredSources: ["cronometer", "myfitnesspal", "manual", "voice"],
  },
  training: {
    weekdayPattern: ["monday", "tuesday", "wednesday", "thursday", "friday"],
    weekendPattern: ["saturday", "sunday"],
    estimatedWorkoutDurationMinutes: 90,
    estimatedTrainingActiveCalories: {
      value: 700,
      unit: "kcal",
    },
    estimatedDailyActiveCalories: {
      value: 1000,
      unit: "kcal",
      source: "apple_watch_manual_estimate",
    },
    activeCalorieMarginOfErrorPercent: 30,
    notes:
      "Weekday gym before work. Weekends typically include afternoon workouts. Diet remains consistent.",
  },
  protocols: {
    activeProtocolIds: [
      "protocol_retatrutide_founder",
      "protocol_tesamorelin_founder",
    ],
    supplementProtocolIds: [
      "protocol_tongkat_ali_founder",
      "protocol_fadogia_agrestis_founder",
      "protocol_multivitamin_founder",
      "protocol_electrolytes_founder",
    ],
    futureDoseChangesCreatePriorities: true,
  },
  evidenceProtocols: {
    morningWeight: {
      cadence: "daily",
      timeOfDay: "morning",
      defaultContext: {
        morning: true,
        fasted: true,
        beforeFoodWater: true,
        normalHomeScale: true,
      },
    },
    progressPhotos: [
      {
        title: "Weekly Progress Photo Set",
        cadence: "weekly",
        dayOfWeek: "saturday",
        timeOfDay: "afternoon",
        expectedViews: ["front-relaxed", "back-relaxed", "back-flexed"],
      },
    ],
    dexa: {
      cadence: "manual",
      notes: "DEXA scheduled manually and treated as authoritative calibration.",
    },
  },
  reminderPreferences: {
    notificationOwnership:
      "PhysiqueOS orchestrates cross-system reminders and avoids duplicating connected systems.",
    ownedReminderTypes: [
      "protocols",
      "dose_changes",
      "progress_photos",
      "dexa",
      "coach_recommendations",
      "evidence_quality",
    ],
    avoidDuplicatingSources: ["apple_watch", "oura", "cronometer"],
  },
  acquisitionPreferences: {
    weight: ["apple_health", "smart_scale", "voice", "manual"],
    workout: ["apple_health", "garmin", "voice", "manual"],
    nutrition: ["cronometer", "voice", "manual"],
    sleep: ["oura", "apple_health", "manual"],
    protocols: ["voice", "manual"],
    recovery: ["oura", "apple_health", "voice", "manual"],
  },
  source: {
    type: "manual",
    name: "Founder",
    externalId: null,
    importedAt: null,
    confidence: "high",
    notes: "Founder-provided operating plan.",
  },
  fieldProvenance: {
    imported: [
      "primaryGoalId",
      "supportingObjectiveIds",
      "nutrition",
      "training",
      "protocols",
      "evidenceProtocols",
      "reminderPreferences",
      "acquisitionPreferences",
    ],
    computed: [],
  },
  createdAt: null,
  updatedAt: null,
});
