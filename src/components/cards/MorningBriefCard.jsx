import Card from "../ui/Card";

export default function MorningBriefCard({
  summary,
  actionLabel,
  onAction,
}) {
  return (
    <Card className="space-y-6">

      <div>

        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">
          TODAY&apos;S BRIEF
        </p>

        <h2 className="mt-2 text-2xl font-semibold leading-tight text-slate-900">
          Yesterday was a win.
        </h2>

        <p className="mt-4 text-base leading-7 text-slate-600">
          {summary}
        </p>

      </div>

      <button
        onClick={onAction}
        className="
          w-full
          rounded-2xl
          bg-indigo-600
          py-4
          text-base
          font-semibold
          text-white
          transition
          hover:bg-indigo-700
        "
      >
        {actionLabel}
      </button>

    </Card>
  );
}
