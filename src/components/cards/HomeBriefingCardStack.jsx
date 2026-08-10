import LatestAnalysisCard from "./LatestAnalysisCard";

export default function HomeBriefingCardStack({ cards = [] }) {
  if (!cards.length) return null;

  return (
    <div className="space-y-2.5">
      {cards.map((card) => (
        <LatestAnalysisCard key={card.id} {...card} />
      ))}
    </div>
  );
}
