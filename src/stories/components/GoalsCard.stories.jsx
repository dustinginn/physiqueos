import GoalsCard from "../../components/cards/GoalsCard";
import { homeGoals } from "../../fixtures/homeGoals";

const meta = {
  title: "Components/GoalsCard",
  component: GoalsCard,
};

export default meta;

export const Default = {
  render: () => (
    <div className="w-[393px] bg-[#F7F8FA] p-4">
      <GoalsCard goals={homeGoals} />
    </div>
  ),
};
