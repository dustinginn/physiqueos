import BottomNavigation from "../../components/navigation/BottomNavigation";
import { bottomNavigation } from "../../fixtures/bottomNavigation";

const meta = {
  title: "Components/BottomNavigation",
  component: BottomNavigation,
};

export default meta;

export const Default = {
  render: () => (
    <div className="w-[393px] bg-[#F7F8FA] p-4">
      <BottomNavigation items={bottomNavigation} />
    </div>
  ),
};
