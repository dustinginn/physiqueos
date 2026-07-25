export default function NutritionMacroDistributionChart({ distribution }) {
  if (!distribution.available) {
    return <EmptyChart label="Macro distribution is not available for this period." />;
  }
  const stops = distribution.items.flatMap((item, index, items) => {
    const start = items
      .slice(0, index)
      .reduce((sum, current) => sum + current.percentage, 0);
    const end = start + item.percentage;
    return [`${item.color} ${start}%`, `${item.color} ${end}%`];
  });

  return (
    <div className="grid grid-cols-[112px_1fr] items-center gap-4">
      <div
        aria-label={distribution.items
          .map((item) => `${item.label} ${item.percentage}%`)
          .join(", ")}
        className="grid h-28 w-28 place-items-center rounded-full"
        role="img"
        style={{ background: `conic-gradient(${stops.join(",")})` }}
      >
        <span className="grid h-16 w-16 place-items-center rounded-full bg-[var(--surface-elevated)] text-center text-[10px] font-extrabold text-[var(--text-muted)]">
          Macro-derived
          <br />
          calories
        </span>
      </div>
      <div className="min-w-0 space-y-2">
        {distribution.items.map((item) => (
          <div className="flex items-center justify-between gap-2" key={item.key}>
            <span className="inline-flex min-w-0 items-center gap-2 text-xs font-bold text-[var(--text-secondary)]">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              {item.label}
            </span>
            <span className="shrink-0 text-right text-xs font-extrabold text-[var(--text-primary)]">
              {item.percentage}% · {Math.round(item.grams).toLocaleString()}g
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyChart({ label }) {
  return (
    <div className="grid h-36 place-items-center rounded-[14px] bg-[var(--chart-bg)] px-4 text-center text-sm font-bold text-[var(--text-subtle)]">
      {label}
    </div>
  );
}
