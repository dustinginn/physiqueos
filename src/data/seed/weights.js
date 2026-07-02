import { createWeightEntry } from "../../domain/models/weightEntry";

export const seedWeightEntries = [
  createWeightEntry({
    id: "weight_2026_06_24",
    userId: "user_founder_001",
    measuredAt: "2026-06-24T07:10:00.000Z",
    weight: { value: 173.1, unit: "lb" },
    createdAt: "2026-06-24T07:11:00.000Z",
    updatedAt: "2026-06-24T07:11:00.000Z",
  }),
  createWeightEntry({
    id: "weight_2026_06_25",
    userId: "user_founder_001",
    measuredAt: "2026-06-25T07:08:00.000Z",
    weight: { value: 172.6, unit: "lb" },
    createdAt: "2026-06-25T07:09:00.000Z",
    updatedAt: "2026-06-25T07:09:00.000Z",
  }),
  createWeightEntry({
    id: "weight_2026_06_26",
    userId: "user_founder_001",
    measuredAt: "2026-06-26T07:12:00.000Z",
    weight: { value: 172.2, unit: "lb" },
    createdAt: "2026-06-26T07:13:00.000Z",
    updatedAt: "2026-06-26T07:13:00.000Z",
  }),
  createWeightEntry({
    id: "weight_2026_06_27",
    userId: "user_founder_001",
    measuredAt: "2026-06-27T07:09:00.000Z",
    weight: { value: 171.8, unit: "lb" },
    createdAt: "2026-06-27T07:10:00.000Z",
    updatedAt: "2026-06-27T07:10:00.000Z",
  }),
  createWeightEntry({
    id: "weight_2026_06_28",
    userId: "user_founder_001",
    measuredAt: "2026-06-28T07:15:00.000Z",
    weight: { value: 171.5, unit: "lb" },
    createdAt: "2026-06-28T07:16:00.000Z",
    updatedAt: "2026-06-28T07:16:00.000Z",
  }),
];
