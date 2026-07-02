import { createDEXAScan } from "../../domain/models/dexaScan";

export const seedDEXAScans = [
  createDEXAScan({
    id: "dexa_2026_06_20",
    userId: "user_founder_001",
    measuredAt: "2026-06-20T10:00:00.000Z",
    provider: "BodySpec",
    bodyFatPercentage: 12.4,
    fatMass: {
      value: 21.3,
      unit: "lb",
    },
    leanMass: {
      value: 149,
      unit: "lb",
    },
    boneMass: {
      value: null,
      unit: "lb",
    },
    visceralFat: null,
    createdAt: "2026-06-20T10:15:00.000Z",
    updatedAt: "2026-06-20T10:15:00.000Z",
  }),
];
