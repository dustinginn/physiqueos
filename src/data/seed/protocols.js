import {
  createProtocol,
  ProtocolCategory,
} from "../../domain/models/protocol";

export const seedProtocols = [
  createProtocol({
    id: "protocol_retatrutide",
    userId: "user_founder_001",
    name: "Retatrutide",
    category: ProtocolCategory.MEDICATION,
    startDate: "2026-06-03",
    dose: {
      value: 2,
      unit: "mg",
    },
    frequency: {
      interval: 1,
      unit: "week",
      daysOfWeek: ["monday"],
    },
    schedule: {
      type: "recurring",
      nextScheduledAt: "2026-06-29T08:00:00.000Z",
    },
    notes:
      "Track appetite, adherence, recovery, and weight trend changes while active.",
    createdAt: "2026-06-03T00:00:00.000Z",
    updatedAt: "2026-06-28T00:00:00.000Z",
  }),
  createProtocol({
    id: "protocol_creatine",
    userId: "user_founder_001",
    name: "Creatine",
    category: ProtocolCategory.SUPPLEMENT,
    startDate: "2026-06-01",
    dose: {
      value: 5,
      unit: "g",
    },
    frequency: {
      interval: 1,
      unit: "day",
      daysOfWeek: [],
    },
    schedule: {
      type: "daily",
      nextScheduledAt: "2026-06-28T09:00:00.000Z",
    },
    notes: "May influence scale weight through water retention.",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-28T00:00:00.000Z",
  }),
  createProtocol({
    id: "protocol_cut_phase",
    userId: "user_founder_001",
    name: "Summer Cut",
    category: ProtocolCategory.NUTRITION,
    startDate: "2026-06-01",
    endDate: "2026-07-18",
    dose: {
      value: null,
      unit: "",
    },
    frequency: {
      interval: null,
      unit: "",
      daysOfWeek: [],
    },
    schedule: {
      type: "phase",
      nextScheduledAt: null,
    },
    notes:
      "Provides context for calorie targets, adherence, and expected weight trend.",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-28T00:00:00.000Z",
  }),
  createProtocol({
    id: "protocol_training_block",
    userId: "user_founder_001",
    name: "Resistance Training Block",
    category: ProtocolCategory.TRAINING,
    startDate: "2026-06-01",
    dose: {
      value: 4,
      unit: "sessions/week",
    },
    frequency: {
      interval: 4,
      unit: "week",
      daysOfWeek: ["monday", "tuesday", "thursday", "saturday"],
    },
    schedule: {
      type: "weekly",
      nextScheduledAt: "2026-06-29T17:30:00.000Z",
    },
    notes:
      "Provides context for recovery, lean mass trend, and short-term water retention.",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-28T00:00:00.000Z",
  }),
];
