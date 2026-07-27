export function TrainingPerformanceHighlights({ items, compact = false }) {
  if (!items?.length) return null;
  return <div className={compact ? "mt-3" : "mt-5"}>
    <p className="text-[10px] font-black uppercase tracking-[.08em] text-[var(--text-muted)]">🔥 Highlights</p>
    <div className="mt-2 space-y-2">{items.map((item) => <div
      className="rounded-xl border border-[color-mix(in_srgb,var(--success)_22%,var(--divider))] bg-[var(--surface-muted)] p-3"
      key={`${item.exercise}-${item.label}`}
    >
      <div className="flex items-start gap-2"><span aria-hidden>{item.icon ?? "↗"}</span><div className="min-w-0">
        <p className="text-sm font-black text-[var(--text-primary)]">{item.exercise}</p>
        <p className="text-[10px] font-extrabold uppercase tracking-[.06em] text-[var(--success)]">{item.label}</p>
      </div></div>
      {Number.isFinite(item.value) && <p className="mt-2 text-xl font-black">{trainingValue(item)}</p>}
      {Number.isFinite(item.delta) && <p className="mt-0.5 text-xs font-extrabold text-[var(--success)]">▲ {signedNumber(item.delta)} {item.unit} {Number.isFinite(item.percentChange) && `(${signedNumber(item.percentChange)}%)`}</p>}
      {item.explanation && <p className="mt-2 text-xs font-semibold leading-5 text-[var(--text-secondary)]">{item.explanation}</p>}
    </div>)}</div>
  </div>;
}

export function TrainingWatchList({ items, label = "👀 Watch", showItemLabels = false, compact = false }) {
  if (!items?.length) return null;
  return <div className={compact ? "mt-4" : "mt-5"}>
    <p className="text-[10px] font-black uppercase tracking-[.08em] text-[var(--text-muted)]">{label}</p>
    <div className="mt-2 space-y-2">{items.map((item) => <div
      className="rounded-xl bg-[var(--surface-muted)] p-3"
      key={item.id ?? item.exercise ?? item.label}
    >
      {showItemLabels && (item.label || item.exercise) && <p className="text-xs font-black text-[var(--text-primary)]">{item.label ?? item.exercise}</p>}
      <p className={`${showItemLabels && (item.label || item.exercise) ? "mt-1 " : ""}text-xs font-bold leading-5 text-[var(--text-secondary)]`}>{item.message}</p>
    </div>)}</div>
  </div>;
}

function trainingValue(item) {
  return Number.isFinite(item.value)
    ? `${Number(item.value).toLocaleString("en-US", { maximumFractionDigits: 1 })} ${item.unit}`
    : "Record set";
}

function signedNumber(number) {
  return `${number > 0 ? "+" : "−"}${Math.abs(Number(number)).toLocaleString("en-US", { maximumFractionDigits: 1 })}`;
}
