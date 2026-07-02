import Card from "../ui/Card";

export default function GoalCard({
  title,
  current,
  target,
  unit = "",
  progress = 0,
  status = "On Track",
  confidence = 95,
  projected = "",
  primary = false,
}) {
  const statusColors = {
    "On Track": "bg-emerald-100 text-emerald-700",
    Ahead: "bg-sky-100 text-sky-700",
    Plateau: "bg-amber-100 text-amber-700",
    "Off Track": "bg-rose-100 text-rose-700",
    Completed: "bg-violet-100 text-violet-700",
  };

  return (
    <Card className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {primary ? "Primary Goal" : "Goal"}
          </p>

          <h2 className="mt-1 text-2xl font-semibold text-slate-900">
            {title}
          </h2>
        </div>

        <div
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            statusColors[status] || statusColors["On Track"]
          }`}
        >
          {status}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-end gap-3">
          <span className="text-4xl font-bold text-slate-900">
            {current}
            {unit}
          </span>

          <span className="pb-1 text-slate-400">→</span>

          <span className="pb-1 text-2xl font-semibold text-slate-500">
            {target}
            {unit}
          </span>
        </div>

        <p className="text-sm text-slate-500">
          Current → Target
        </p>
      </div>

      <div>
        <div className="mb-2 flex justify-between text-sm text-slate-500">
          <span>Progress</span>
          <span>{progress}%</span>
        </div>

        <div className="h-3 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-700"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div>
          <p className="text-xs text-slate-500">Projected</p>
          <p className="mt-1 font-semibold">{projected}</p>
        </div>

        <div>
          <p className="text-xs text-slate-500">Confidence</p>
          <p className="mt-1 font-semibold text-emerald-600">
            {confidence}%
          </p>
        </div>
      </div>
    </Card>
  );
}