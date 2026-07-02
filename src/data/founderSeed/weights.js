import { createWeightEntry } from "../../domain/models/weightEntry";

const USER_ID = "user_founder_001";
const BODY_FAT_GOAL_ID = "goal_maintain_8_9_body_fat";
const VISIBLE_ABS_GOAL_ID = "goal_visible_abs_at_rest";

const source = {
  type: "manual",
  name: "Founder",
  externalId: null,
  importedAt: null,
  confidence: "high",
  notes: "Verified founder manual morning weight history.",
};

const fieldProvenance = {
  imported: [
    "measuredAt",
    "weight.value",
    "weight.unit",
    "relatedGoalIds",
    "context",
    "notes",
  ],
  computed: [],
};

const defaultWeighInContext = {
  timing: "morning",
  nutritionState: "fasted",
  intakeState: "before_food_water",
  scale: "normal_home_scale",
  conditions: [],
  confidence: "high",
  notes: null,
  isDefault: true,
};

function createFounderWeight(date, value, notes = "") {
  return createWeightEntry({
    id: `weight_${date.replaceAll("-", "_")}`,
    userId: USER_ID,
    measuredAt: date,
    weight: {
      value,
      unit: "lb",
    },
    relatedGoalIds: [BODY_FAT_GOAL_ID, VISIBLE_ABS_GOAL_ID],
    context: defaultWeighInContext,
    source,
    fieldProvenance,
    reliability: "high",
    notes,
    createdAt: null,
    updatedAt: null,
  });
}

export const founderWeightEntries = [
  createFounderWeight("2026-05-21", 178.0),
  createFounderWeight("2026-05-29", 176.8),
  createFounderWeight("2026-06-01", 177.1),
  createFounderWeight("2026-06-02", 176.1),
  createFounderWeight("2026-06-03", 174.8),
  createFounderWeight("2026-06-04", 175.8),
  createFounderWeight("2026-06-05", 175.5),
  createFounderWeight("2026-06-06", 175.0),
  createFounderWeight("2026-06-07", 174.4),
  createFounderWeight("2026-06-08", 173.8),
  createFounderWeight("2026-06-09", 172.4),
  createFounderWeight("2026-06-10", 172.3),
  createFounderWeight("2026-06-11", 171.7),
  createFounderWeight("2026-06-12", 173.3),
  createFounderWeight("2026-06-13", 171.5),
  createFounderWeight("2026-06-19", 170.8),
  createFounderWeight(
    "2026-06-20",
    170.0,
    "DEXA scan performed the same day. Home scale reading. Do not replace the DEXA body weight contained in the scan."
  ),
  createFounderWeight("2026-06-21", 170.5),
  createFounderWeight("2026-06-22", 170.3),
  createFounderWeight("2026-06-23", 170.9),
  createFounderWeight("2026-06-24", 169.7),
  createFounderWeight("2026-06-25", 170.3),
  createFounderWeight("2026-06-26", 168.3),
  createFounderWeight("2026-06-27", 167.9),
  createFounderWeight("2026-06-28", 167.3),
];
