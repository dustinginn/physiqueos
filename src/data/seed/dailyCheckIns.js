import { createDailyCheckIn } from "../../domain/models/dailyCheckIn";

export const seedDailyCheckIns = [
  createDailyCheckIn({
    id: "checkin_2026_06_27",
    userId: "user_founder_001",
    date: "2026-06-27",
    weightEntryId: "weight_2026_06_27",
    completedFocusItems: [
      "morning-weight",
      "protein-target",
      "activity-ring",
    ],
    nutrition: {
      proteinTargetHit: true,
      calorieTargetHit: true,
      notes: "",
    },
    activity: {
      activityRingClosed: true,
      workoutCompleted: false,
      steps: 9800,
    },
    recovery: {
      sleepHours: 7.4,
      sleepTargetHit: false,
    },
    protocols: {
      completedProtocolIds: ["protocol_creatine"],
    },
    createdAt: "2026-06-27T20:00:00.000Z",
    updatedAt: "2026-06-27T20:00:00.000Z",
  }),
  createDailyCheckIn({
    id: "checkin_2026_06_28",
    userId: "user_founder_001",
    date: "2026-06-28",
    weightEntryId: "weight_2026_06_28",
    completedFocusItems: ["morning-weight"],
    nutrition: {
      proteinTargetHit: false,
      calorieTargetHit: null,
      notes: "",
    },
    activity: {
      activityRingClosed: false,
      workoutCompleted: null,
      steps: null,
    },
    recovery: {
      sleepHours: null,
      sleepTargetHit: false,
    },
    protocols: {
      completedProtocolIds: [],
    },
    createdAt: "2026-06-28T08:00:00.000Z",
    updatedAt: "2026-06-28T08:00:00.000Z",
  }),
];
