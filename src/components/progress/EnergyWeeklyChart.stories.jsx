import EnergyWeeklyChart from "./EnergyWeeklyChart";

const meta = {
  component: EnergyWeeklyChart,
  title: "Progress/EnergyWeeklyChart",
};

export default meta;

export const SparseHistory = {
  args: {
    weeks: [
      {
        id: "energy-week-2026-07-19",
        weekStart: "2026-07-19",
        weekEnd: "2026-07-25",
        averageIntake: 2308,
        averageExpenditure: 2894,
        averageBalance: -666,
        completeDayCount: 1,
        evidenceDayCount: 5,
        partial: true,
      },
    ],
  },
};

export const MultiWeek = {
  args: {
    weeks: [
      SparseHistory.args.weeks[0],
      {
        id: "energy-week-2026-07-12",
        weekStart: "2026-07-12",
        weekEnd: "2026-07-18",
        averageIntake: 2070,
        averageExpenditure: 2575,
        averageBalance: -505,
        completeDayCount: 4,
        evidenceDayCount: 7,
        partial: true,
      },
    ],
  },
};
