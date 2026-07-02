import {
  createMilestone,
  MilestoneStatus,
} from "../../domain/models/milestone";

export const seedMilestones = [
  createMilestone({
    id: "milestone_under_13_body_fat",
    userId: "user_founder_001",
    goalId: "goal_body_fat_10",
    title: "Under 13% Body Fat",
    metricKey: "bodyFatPercentage",
    targetValue: 13,
    unit: "%",
    targetDate: "2026-06-30",
    achievedAt: "2026-06-20T10:00:00.000Z",
    status: MilestoneStatus.ACHIEVED,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-20T10:00:00.000Z",
  }),
  createMilestone({
    id: "milestone_goal_body_fat",
    userId: "user_founder_001",
    goalId: "goal_body_fat_10",
    title: "Reach 10% Body Fat",
    metricKey: "bodyFatPercentage",
    targetValue: 10,
    unit: "%",
    targetDate: "2026-07-18",
    status: MilestoneStatus.UPCOMING,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-28T00:00:00.000Z",
  }),
];
