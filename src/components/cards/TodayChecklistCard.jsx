import { CheckCircle2, Circle } from "lucide-react";

export default function TodayChecklistCard({ checklist }) {
  const completed = checklist.filter((item) => item.completed).length;

  return (
    <div className="rounded-2xl border border-[var(--divider)] bg-[var(--surface-elevated)] p-6 shadow-[var(--shadow-card)]">
      <h2 className="text-xl font-semibold text-[var(--text-primary)]">
        Today&apos;s Progress
      </h2>

      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Complete today&apos;s priorities to improve your prediction.
      </p>

      <div className="mt-6 space-y-4">
        {checklist.map((item) => (
          <div className="flex items-center justify-between" key={item.id}>
            <span className="text-[var(--text-secondary)]">{item.label}</span>

            <span
              className={
                item.completed ? "text-[var(--confidence)]" : "text-[var(--text-subtle)]"
              }
            >
              {item.completed ? (
                <CheckCircle2 size={22} aria-label="Completed" />
              ) : (
                <Circle size={22} aria-label="Not completed" />
              )}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-xl bg-[var(--surface-muted)] p-4">
        <p className="text-sm text-[var(--text-muted)]">Daily Progress</p>

        <p className="mt-1 text-3xl font-bold text-[var(--text-primary)]">
          {completed} / {checklist.length}
        </p>
      </div>
    </div>
  );
}
