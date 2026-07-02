import ProgressBar from "../../components/ui/ProgressBar";

const meta = {
  title: "Components/ProgressBar",
  component: ProgressBar,
};

export default meta;

export const Default = {
  render: () => (
    <div className="w-[240px] bg-white p-6">
      <ProgressBar value={76} label="Goal progress" />
    </div>
  ),
};

export const Brand = {
  render: () => (
    <div className="w-[240px] bg-white p-6">
      <ProgressBar value={48} color="#4F46E5" label="Lean mass progress" />
    </div>
  ),
};
