import BottomNavItem from "../../components/navigation/BottomNavItem";

const meta = {
  title: "Components/BottomNavItem",
  component: BottomNavItem,
};

export default meta;

export const Active = {
  render: () => (
    <div className="w-20 bg-white p-2">
      <BottomNavItem active icon="home" label="Home" route="home" />
    </div>
  ),
};

export const Inactive = {
  render: () => (
    <div className="w-20 bg-white p-2">
      <BottomNavItem icon="progress" label="Progress" route="progress" />
    </div>
  ),
};
