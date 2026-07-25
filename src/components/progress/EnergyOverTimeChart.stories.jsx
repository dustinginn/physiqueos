import EnergyOverTimeChart from "./EnergyOverTimeChart";

const meta = {
  component: EnergyOverTimeChart,
  title: "Progress/EnergyOverTimeChart",
};

export default meta;

export const Sparse = {
  args: {
    latestEvidenceDate: "2026-07-24",
    weeks: [
      {
        id: "energy-week-2026-07-19",
        weekStart: "2026-07-19",
        weekEnd: "2026-07-25",
        averageIntake: 2290,
        averageExpenditure: 2665,
        averageBalance: -375,
        completeDayCount: 4,
        evidenceDayCount: 6,
        partial: true,
      },
    ],
  },
};
