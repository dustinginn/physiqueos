import GoalRow from "../../components/goals/GoalRow";

const meta = {
  title: "Components/GoalRow",
  component: GoalRow,
};

export default meta;

export const Primary = {
  render: () => (
    <div className="w-[361px] bg-white p-4">
      <GoalRow
        title="10% Body Fat"
        current="12.4"
        target="10"
        unit="%"
        progress={76}
        primary
        icon="target"
        color="primary"
      />
    </div>
  ),
};

export const Secondary = {
  render: () => (
    <div className="w-[361px] bg-white p-4">
      <GoalRow
        title="Lean Mass"
        current="149"
        target="155"
        unit=" lbs"
        progress={48}
        icon="dumbbell"
        color="primary"
        progressColor="#4F46E5"
      />
    </div>
  ),
};
