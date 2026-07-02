export default function GoalProgressRow({
  title,
  current,
  target,
  unit = "",
  progress,
  status,
  primary = false,
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <h3
            className={
              primary
                ? "text-xl font-semibold text-slate-900"
                : "text-lg font-medium text-slate-800"
            }
          >
            {title}
          </h3>

          <p className="mt-1 text-sm text-slate-500">
            {current}
            {unit} → {target}
            {unit}
          </p>
        </div>

        <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
          {status}
        </span>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all duration-500"
          style={{
            width: `${progress}%`,
          }}
        />
      </div>
    </div>
  );
}