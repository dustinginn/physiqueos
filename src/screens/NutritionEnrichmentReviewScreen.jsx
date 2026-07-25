import Link from "next/link";
import { AlertTriangle, CheckCircle2, CircleOff, Database } from "lucide-react";
import Card from "../components/ui/Card";

const STATUS_STYLES = {
  ready_to_enrich: "bg-emerald-100 text-emerald-900",
  needs_review: "bg-amber-100 text-amber-900",
  source_unavailable: "bg-slate-200 text-slate-800",
  already_structured: "bg-indigo-100 text-indigo-900",
  not_eligible: "bg-slate-100 text-slate-700",
};

export default function NutritionEnrichmentReviewScreen({ review }) {
  return (
    <main className="app-surface min-h-screen">
      <div className="mx-auto max-w-[720px] px-4 pb-20 pt-8 sm:px-6 sm:py-10">
        <Link className="inline-flex min-h-11 items-center text-sm font-bold text-[var(--primary)]" href="/progress/nutrition">
          ← Nutrition
        </Link>
        <header className="mt-3">
          <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[var(--primary)]">
            Historical meal review
          </p>
          <h1 className="mt-2 text-3xl font-extrabold text-[var(--text-primary)]">
            Which days can recover meal details?
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
            This is a read-only inspection. Logged daily totals stay unchanged, and no meal details are added from this page.
          </p>
        </header>

        <section aria-labelledby="summary-heading" className="mt-6">
          <h2 className="sr-only" id="summary-heading">Review summary</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <SummaryMetric label="Historical days" value={review.total} />
            <SummaryMetric label="Ready to enrich" value={review.counts.ready_to_enrich} />
            <SummaryMetric label="Needs review" value={review.counts.needs_review} />
            <SummaryMetric label="Source unavailable" value={review.counts.source_unavailable} />
            <SummaryMetric label="Already structured" value={review.counts.already_structured} />
            <SummaryMetric label="Not eligible" value={review.counts.not_eligible} />
          </div>
        </section>

        <div className="mt-6 space-y-4">
          {review.days.map((day) => <DayCard day={day} key={day.id} />)}
        </div>
      </div>
    </main>
  );
}

function SummaryMetric({ label, value }) {
  return (
    <Card className="min-w-0 p-4" variant="soft">
      <p className="text-2xl font-extrabold text-[var(--text-primary)]">{value}</p>
      <p className="mt-1 break-words text-xs font-bold leading-4 text-[var(--text-secondary)]">{label}</p>
    </Card>
  );
}

function DayCard({ day }) {
  const StatusIcon = day.status === "ready_to_enrich"
    ? CheckCircle2
    : day.status === "needs_review"
      ? AlertTriangle
      : day.status === "already_structured"
        ? Database
        : CircleOff;

  return (
    <Card className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold text-[var(--text-muted)]">{formatDate(day.date)}</p>
          <h2 className="mt-1 text-lg font-extrabold text-[var(--text-primary)]">Nutrition day</h2>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-extrabold ${STATUS_STYLES[day.status]}`}>
          <StatusIcon aria-hidden="true" size={14} />
          {day.statusLabel}
        </span>
      </div>

      <p className="text-sm leading-6 text-[var(--text-secondary)]">{day.message}</p>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Calories" value={formatMetric("calories", day.existing.totals.calories)} />
        <Metric label="Protein" value={formatMetric("protein_g", day.existing.totals.protein_g)} />
        <Metric label="Carbs" value={formatMetric("carbs_g", day.existing.totals.carbs_g)} />
        <Metric label="Fat" value={formatMetric("fat_g", day.existing.totals.fat_g)} />
      </dl>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="min-w-0 rounded-xl bg-[var(--surface-muted)] p-3">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)]">Original sources</p>
          <p className="mt-1 font-extrabold text-[var(--text-primary)]">
            {day.source.count} {day.source.count === 1 ? "screenshot" : "screenshots"}
          </p>
          <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
            {day.source.allAccessible ? "All available" : "Not fully available"}
          </p>
        </div>
        <div className="min-w-0 rounded-xl bg-[var(--surface-muted)] p-3">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)]">Proposed details</p>
          <p className="mt-1 font-extrabold text-[var(--text-primary)]">
            {day.proposed?.mealCount ?? 0} meals · {day.proposed?.foodCount ?? 0} foods
          </p>
          <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
            {day.comparison?.summary ?? "No new meal details proposed."}
          </p>
        </div>
      </div>

      {day.warnings.length > 0 && (
        <ul className="space-y-1 text-xs leading-5 text-[var(--text-secondary)]">
          {day.warnings.map((warning) => <li key={warning}>• {warning}</li>)}
        </ul>
      )}

      <details className="min-w-0 rounded-xl border border-[var(--divider)]">
        <summary className="min-h-11 cursor-pointer px-3 py-3 text-sm font-extrabold text-[var(--text-primary)]">
          Inspect source and meal details
        </summary>
        <div className="min-w-0 space-y-5 border-t border-[var(--divider)] p-3">
          <SourceDetails source={day.source} />
          {day.proposed?.meals?.length > 0 ? (
            <MealDetails meals={day.proposed.meals} />
          ) : (
            <p className="text-sm leading-6 text-[var(--text-secondary)]">
              No structured meal proposal was produced from the retained screenshots.
            </p>
          )}
          {day.comparison && <ComparisonDetails comparison={day.comparison} />}
        </div>
      </details>
    </Card>
  );
}

function SourceDetails({ source }) {
  return (
    <section>
      <h3 className="text-sm font-extrabold text-[var(--text-primary)]">Original screenshots</h3>
      <ul className="mt-2 space-y-1 text-xs leading-5 text-[var(--text-secondary)]">
        {source.labels.length > 0
          ? source.labels.map((label) => <li className="break-words" key={label}>{label}</li>)
          : <li>No retained screenshot reference</li>}
      </ul>
    </section>
  );
}

function MealDetails({ meals }) {
  return (
    <section>
      <h3 className="text-sm font-extrabold text-[var(--text-primary)]">Proposed meals</h3>
      <div className="mt-2 space-y-3">
        {meals.map((meal) => (
          <div className="min-w-0 rounded-xl bg-[var(--surface-muted)] p-3" key={meal.id ?? meal.name}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-extrabold text-[var(--text-primary)]">{meal.name}</p>
              <p className="text-xs font-bold text-[var(--text-secondary)]">
                {formatMetric("calories", meal.totals.calories)} · {meal.foods.length} foods
              </p>
            </div>
            <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
              {formatMetric("protein_g", meal.totals.protein_g)} protein · {formatMetric("carbs_g", meal.totals.carbs_g)} carbs · {formatMetric("fat_g", meal.totals.fat_g)} fat
            </p>
            <ul className="mt-3 space-y-2 border-t border-[var(--divider)] pt-3">
              {meal.foods.map((food, index) => (
                <li className="flex min-w-0 items-start justify-between gap-3 text-sm" key={food.id ?? `${food.name}-${index}`}>
                  <div className="min-w-0">
                    <p className="break-words font-bold text-[var(--text-primary)]">{food.name}</p>
                    {(food.brand || food.serving) && (
                      <p className="mt-0.5 break-words text-xs text-[var(--text-secondary)]">
                        {[food.brand, food.serving].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs font-bold text-[var(--text-secondary)]">
                    {formatMetric("calories", food.totals.calories)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function ComparisonDetails({ comparison }) {
  return (
    <section>
      <h3 className="text-sm font-extrabold text-[var(--text-primary)]">Totals comparison</h3>
      <div className="mt-2 overflow-hidden rounded-xl border border-[var(--divider)]">
        <table className="w-full table-fixed text-left text-xs">
          <thead className="bg-[var(--surface-muted)] text-[var(--text-muted)]">
            <tr><th className="px-2 py-2">Metric</th><th className="px-2 py-2">Logged</th><th className="px-2 py-2">Detected</th><th className="px-2 py-2">Meal sum</th></tr>
          </thead>
          <tbody>
            {["calories", "protein_g", "carbs_g", "fat_g"].map((key) => (
              <tr className="border-t border-[var(--divider)]" key={key}>
                <th className="break-words px-2 py-2 font-bold text-[var(--text-primary)]">{metricLabel(key)}</th>
                <td className="break-words px-2 py-2 text-[var(--text-secondary)]">{formatMetric(key, comparison.existingTotals[key])}</td>
                <td className="break-words px-2 py-2 text-[var(--text-secondary)]">{formatMetric(key, comparison.proposedTotals[key])}</td>
                <td className="break-words px-2 py-2 text-[var(--text-secondary)]">{formatMetric(key, comparison.mealSums[key])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Metric({ label, value }) {
  return <div className="rounded-xl bg-[var(--surface-muted)] p-3"><dt className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)]">{label}</dt><dd className="mt-1 text-sm font-extrabold text-[var(--text-primary)]">{value}</dd></div>;
}

function formatDate(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  if (![year, month, day].every(Number.isFinite)) return value;
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
}

function formatMetric(key, value) {
  if (value === null || value === undefined) return "—";
  return `${Number(value).toLocaleString("en-US", { maximumFractionDigits: 1 })}${key === "calories" ? " cal" : " g"}`;
}

function metricLabel(key) {
  return { calories: "Calories", protein_g: "Protein", carbs_g: "Carbs", fat_g: "Fat" }[key];
}
