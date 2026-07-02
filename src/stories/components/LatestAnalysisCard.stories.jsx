import LatestAnalysisCard from "../../components/cards/LatestAnalysisCard";

const meta = {
  title: "Components/LatestAnalysisCard",
  component: LatestAnalysisCard,
};

export default meta;

export const Default = {
  render: () => (
    <div className="w-[393px] bg-[#F7F8FA] p-4">
      <LatestAnalysisCard
        sectionLabel="Daily Briefing"
        title="Daily Briefing Ready"
        createdAt="2026-06-28T08:00:00.000Z"
        prompt="See what changed."
        href="/briefing/daily"
      />
    </div>
  ),
};
