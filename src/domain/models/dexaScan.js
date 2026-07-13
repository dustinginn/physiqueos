import { createFieldProvenance, createSource } from "./recordMetadata";

function createDEXAMass(unit = "lb") {
  return {
    value: null,
    unit,
  };
}

function createRegionalAssessment() {
  return {
    arms: null,
    legs: null,
    trunk: null,
    android: null,
    gynoid: null,
    total: null,
  };
}

export function createDEXAScan(data = {}) {
  return {
    id: "",
    userId: "",
    measuredAt: "",
    relatedGoalIds: [],
    provider: "",
    totalMass: createDEXAMass(),
    bodyFatPercentage: null,
    fatMass: {
      value: null,
      unit: "lb",
    },
    leanMass: {
      value: null,
      unit: "lb",
    },
    boneMineralContent: createDEXAMass(),
    restingMetabolicRate: {
      value: null,
      unit: "kcal/day",
    },
    visceralFat: null,
    visceralAdiposeTissue: {
      mass: createDEXAMass(),
      volume: createDEXAMass("in3"),
    },
    androidFatPercentage: null,
    gynoidFatPercentage: null,
    androidGynoidRatio: null,
    regionalAssessment: createRegionalAssessment(),
    muscleBalance: {
      rightArm: null,
      leftArm: null,
      rightLeg: null,
      leftLeg: null,
    },
    boneDensity: {
      totalBMD: null,
      tScore: null,
      zScore: null,
      youngAdultZScore: null,
      ageMatchedZScore: null,
    },
    sourceFileId: null,
    source: createSource({ type: "dexa", confidence: "high" }),
    fieldProvenance: createFieldProvenance(),
    createdAt: "",
    updatedAt: "",
    ...data,
  };
}
