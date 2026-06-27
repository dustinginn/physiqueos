export default function RecommendationCard({ recommendation }) {
  return (
    <div className="rounded-xl border border-blue-700 bg-blue-950/30 p-6">
      <p className="text-sm uppercase tracking-wide text-blue-300">
        Today's Focus
      </p>

      <h2 className="mt-2 text-2xl font-bold text-white">
        {recommendation.title}
      </h2>

      <p className="mt-3 text-zinc-300">
        {recommendation.description}
      </p>
    </div>
  );
}