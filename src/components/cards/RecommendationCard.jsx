import PrimaryButton from "@/components/ui/PrimaryButton";

export default function RecommendationCard({
  recommendation,
  onPrimaryAction,
}) {
  return (
    <div className="rounded-2xl border border-blue-700 bg-blue-950/30 p-6">
      <p className="text-xs uppercase tracking-wider text-blue-300">
        Today&apos;s Priorities
      </p>

      <h2 className="mt-2 text-3xl font-bold">
        {recommendation.title}
      </h2>

      <p className="mt-3 text-zinc-300">
        {recommendation.description}
      </p>

      <PrimaryButton onClick={onPrimaryAction}>
        Log Weight
      </PrimaryButton>
    </div>
  );
}
