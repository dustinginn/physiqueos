export default function TodayChecklistCard({ checklist }) {
  const completed = checklist.filter(item => item.completed).length;

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">

      <h2 className="text-xl font-semibold text-white">
        Today's Progress
      </h2>

      <p className="mt-1 text-sm text-zinc-400">
        Complete today's priorities to improve your prediction.
      </p>

      <div className="mt-6 space-y-4">

        {checklist.map(item => (
          <div
            key={item.id}
            className="flex items-center justify-between"
          >
            <span className="text-zinc-300">
              {item.label}
            </span>

            <span className="text-2xl">
              {item.completed ? "✅" : "⬜"}
            </span>
          </div>
        ))}

      </div>

      <div className="mt-8 rounded-xl bg-zinc-800 p-4">

        <p className="text-sm text-zinc-400">
          Daily Progress
        </p>

        <p className="mt-1 text-3xl font-bold text-white">
          {completed} / {checklist.length}
        </p>

      </div>

    </div>
  );
}