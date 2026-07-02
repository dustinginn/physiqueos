import FocusTile from "../../components/focus/FocusTile";

const meta = {
  title: "Components/FocusTile",
  component: FocusTile,
};

export default meta;

export const Default = {
  render: () => (
    <div className="w-[92px] bg-[#F7F8FA] p-3">
      <FocusTile label="Morning Weight" icon="scale" color="primary" />
    </div>
  ),
};

export const Completed = {
  render: () => (
    <div className="w-[92px] bg-[#F7F8FA] p-3">
      <FocusTile label="Morning Weight" icon="scale" color="primary" completed />
    </div>
  ),
};
