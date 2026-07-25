export default function NutritionAverageMacrosChart({ averages }) {
  const maximum = Math.max(...averages.map((item) => item.average ?? 0), 1);
  if (averages.every((item) => item.average == null)) {
    return (
      <div className="grid h-40 place-items-center rounded-[14px] bg-[var(--chart-bg)] px-4 text-center text-sm font-bold text-[var(--text-subtle)]">
        Average macro values are not available for this period.
      </div>
    );
  }

  return (
    <figure aria-label="Average daily protein, carbohydrates, and fat in grams">
      <div className="flex h-44 items-end justify-center gap-5 rounded-[14px] bg-[var(--chart-bg)] px-4 pb-3 pt-5">
        {averages.map((item) => (
          <div className="flex min-w-0 flex-1 flex-col items-center gap-1" key={item.key}>
            <span className="text-xs font-extrabold text-[var(--text-primary)]">
              {item.average == null ? "—" : `${item.average}g`}
            </span>
            <span className="flex h-24 w-full items-end justify-center">
              <span
                className="block w-9 max-w-full rounded-t-[6px]"
                style={{
                  backgroundColor: item.color,
                  height: item.average == null ? "0%" : `${Math.max(6, (item.average / maximum) * 100)}%`,
                }}
              />
            </span>
            <span className="truncate text-[10px] font-extrabold text-[var(--text-muted)]">
              {item.label}
            </span>
            <span className="text-[9px] font-bold text-[var(--text-subtle)]">
              {item.count} days
            </span>
          </div>
        ))}
      </div>
    </figure>
  );
}
