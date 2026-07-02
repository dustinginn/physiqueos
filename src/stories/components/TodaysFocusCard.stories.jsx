import TodaysFocusCard from "../../components/cards/TodaysFocusCard";
import { todaysFocus } from "../../fixtures/todaysFocus";

const meta = {
  title: "Components/TodaysPrioritiesCard",
  component: TodaysFocusCard,
};

export default meta;

export const Default = {
  render: () => (
    <div className="w-[393px] bg-[#F7F8FA] p-4">
      <TodaysFocusCard items={todaysFocus} />
    </div>
  ),
};
