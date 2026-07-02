import ProgressRing from "../../components/ui/ProgressRing";

const meta = {
  title: "Components/ProgressRing",
  component: ProgressRing,
};

export default meta;

export const Confidence = {
  render: () => (
    <div className="bg-white p-6">
      <ProgressRing value={94} />
    </div>
  ),
};
