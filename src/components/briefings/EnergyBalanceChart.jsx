export default function EnergyBalanceChart({ chart, cadence = "midweek" }) {
  const points = chart?.points ?? [];
  if (chart?.summaryOnly) return <EnergyCoverageChart chart={chart} cadence={cadence}/>;
  const max = Math.max(
    ...points.flatMap((point) => [point.intake, point.expenditure]).filter(Number.isFinite),
    1
  );
  const weekly = cadence === "weekly";

  return <figure className="mt-4 overflow-visible" data-chart={`${cadence}-energy`}>
    <figcaption className="mb-3 text-xs font-extrabold">{chart?.title ?? "Energy Balance"}</figcaption>
    <div
      className={weekly ? "grid gap-1.5" : "grid gap-3"}
      style={{ gridTemplateColumns: `repeat(${Math.max(points.length, 1)}, minmax(0, 1fr))` }}
    >
      {points.map((point, index) => <details className="group relative min-w-0" key={point.date}>
        <summary
          aria-label={energyDayLabel(point)}
          className="list-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
        >
          <div className={`flex h-24 items-end justify-center rounded-lg bg-[var(--surface-muted)] pt-2 ${weekly ? "gap-0.5 px-1" : "gap-1 px-2"}`}>
            <Bar color="var(--chart-3)" max={max} value={point.intake} weekly={weekly}/>
            <Bar color="var(--chart-2)" max={max} value={point.expenditure} weekly={weekly}/>
          </div>
          <p className="mt-1 truncate text-center text-[10px] font-bold">{point.label}{!point.complete ? " · missing" : ""}</p>
        </summary>
        <div className={`absolute bottom-full z-20 mb-2 hidden w-44 rounded-xl bg-[var(--text-primary)] p-3 text-left text-[10px] font-bold leading-5 text-[var(--surface-elevated)] shadow-xl group-open:block group-hover:block ${tooltipPosition(index, points.length)}`}>
          <p className="text-xs font-black">{longDate(point.date)}</p>
          {point.complete ? <>
            <p>Calories eaten: {point.intake.toLocaleString("en-US")} kcal</p>
            <p>Estimated expenditure: {point.expenditure.toLocaleString("en-US")} kcal</p>
            <p>Energy balance: {signedKcal(point.balance)}</p>
          </> : <p>No paired data logged</p>}
        </div>
      </details>)}
    </div>
    <p className="mt-2 text-[9px] font-semibold text-[var(--text-muted)]">
      <span className="text-[var(--chart-3)]">■</span> Intake &nbsp; <span className="text-[var(--chart-2)]">■</span> Estimated expenditure
    </p>
  </figure>;
}

function EnergyCoverageChart({ chart, cadence }) {
  const max = Math.max(
    chart.averageIntake ?? 0,
    chart.averageExpenditure ?? 0,
    1
  );
  const missingDays = chart.points
    .filter((point) => !point.complete)
    .map((point) => longDay(point.date));
  return <figure className="mt-4" data-chart={`${cadence}-energy`}>
    <figcaption className="mb-3 text-xs font-extrabold">Daily coverage</figcaption>
    <div className="grid grid-cols-7 gap-1.5" data-testid="weekly-energy-coverage-cells">
      {chart.points.map((point) => <div
        className={`rounded-lg px-1 py-2 text-center ${point.complete ? "bg-[color-mix(in_srgb,var(--chart-1)_10%,var(--surface-muted))]" : "border border-dashed border-[var(--divider)] bg-[var(--surface-muted)]"}`}
        data-coverage={point.complete ? "complete" : "missing"}
        key={point.date}
      >
        <span
          aria-hidden
          className={point.complete ? "text-[var(--chart-1)]" : "text-[var(--text-muted)]"}
        >{point.complete ? "✓" : "–"}</span>
        <p className="mt-1 text-[9px] font-extrabold text-[var(--text-secondary)]">{point.label}</p>
      </div>)}
    </div>
    <p className="mt-2 text-xs font-bold leading-5 text-[var(--text-secondary)]" data-testid="weekly-energy-coverage">
      {chart.pairedDayCount} of {chart.eligibleDayCount} days complete
      {missingDays.length ? ` · ${missingDays.join(" and ")} missing` : ""}
    </p>
    <figcaption className="mb-3 mt-5 text-xs font-extrabold">Weekly averages</figcaption>
    <div className="grid grid-cols-2 gap-3" data-testid="weekly-energy-average-chart">
      <AverageBar color="var(--chart-3)" label="Intake" max={max} value={chart.averageIntake}/>
      <AverageBar color="var(--chart-2)" label="Expenditure" max={max} value={chart.averageExpenditure}/>
    </div>
    <div className="mt-3 flex items-center justify-between rounded-xl bg-[color-mix(in_srgb,var(--chart-1)_10%,var(--surface-muted))] px-3 py-2" data-color-role="balance-delta">
      <span className="text-[10px] font-extrabold text-[var(--chart-1)]">Average balance</span>
      <span className="text-sm font-black text-[var(--chart-1)]">{signedKcal(chart.averageBalance)}/day</span>
    </div>
  </figure>;
}

function AverageBar({ color, label, max, value }) {
  const magnitude = Math.abs(value ?? 0);
  return <div className="rounded-xl bg-[var(--surface-muted)] px-2 pb-2 pt-3 text-center">
    <div className="flex h-24 items-end justify-center">
      <div
        className="w-7 rounded-t"
        data-color-role={label.toLowerCase()}
        style={{
          backgroundColor: color,
          height: Number.isFinite(value) ? `${Math.max(10, magnitude / max * 100)}%` : "2px",
        }}
      />
    </div>
    <p className="mt-2 text-[10px] font-extrabold text-[var(--text-secondary)]">{label}</p>
    <p className="mt-1 text-[11px] font-black text-[var(--text-primary)]">
      {`${Math.round(value).toLocaleString("en-US")} kcal/day`}
    </p>
  </div>;
}

function Bar({ color, max, value, weekly }) {
  return <div
    className={`${weekly ? "w-2.5" : "w-4"} rounded-t`}
    style={{
      height: Number.isFinite(value) ? `${Math.max(4, value / max * 100)}%` : "2px",
      backgroundColor: Number.isFinite(value) ? color : "var(--divider)",
    }}
  />;
}

function tooltipPosition(index, length) {
  if (index === 0) return "left-0";
  if (index === length - 1) return "right-0";
  return "left-1/2 -translate-x-1/2";
}

function energyDayLabel(point) {
  if (!point.complete) return `${longDate(point.date)}: no paired energy data logged`;
  return `${longDate(point.date)}: ${point.intake.toLocaleString("en-US")} calories eaten, ${point.expenditure.toLocaleString("en-US")} estimated expenditure, ${signedKcal(point.balance)} energy balance`;
}

function signedKcal(number) {
  return `${number > 0 ? "+" : "−"}${Math.abs(Math.round(number)).toLocaleString("en-US")} kcal`;
}

function longDate(value) {
  return value
    ? new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`))
    : "Unavailable";
}

function longDay(value) {
  return value
    ? new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        timeZone: "UTC",
      }).format(new Date(`${value}T12:00:00Z`))
    : "Unknown day";
}
