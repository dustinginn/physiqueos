import TrajectoryCard from "../../components/cards/TrajectoryCard";

const meta = {
  title: "Components/TrajectoryCard",
  component: TrajectoryCard,
};

export default meta;

export const Default = {
  render: () => (
    <div className="w-[393px] bg-[#F7F8FA] p-4">
      <TrajectoryCard />
    </div>
  ),
};

export const LowerConfidence = {
  render: () => (
    <div className="w-[393px] bg-[#F7F8FA] p-4">
      <TrajectoryCard
        title="Slightly behind."
        description="Your projection is close, but recent evidence widened the range."
        confidence={72}
        projectedFinish="Aug 2"
        daysRemaining="33 days"
      />
    </div>
  ),
};
