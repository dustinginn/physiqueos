import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import Card from "../components/ui/Card";

export default function NutritionKnowledgeScreen({
  backHref,
  day,
  mode,
  report,
  slug,
}) {
  const content = getPageContent({ day, mode, report, slug });

  return (
    <main className="app-surface min-h-screen">
      <div className="mx-auto max-w-[393px] px-4 pt-10 pb-24">
        <Link
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-500"
          href={backHref ?? "/progress/nutrition"}
        >
          <ArrowLeft size={18} />
          Nutrition
        </Link>

        <header className="mb-5 space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-indigo-600">
            {content.eyebrow}
          </p>
          <h1 className="text-3xl font-extrabold leading-tight text-slate-950">
            {content.title}
          </h1>
          <p className="text-base leading-7 text-slate-500">{content.summary}</p>
        </header>

        <div className="space-y-4">{content.sections}</div>
      </div>
    </main>
  );
}

function getPageContent({ day, mode, report, slug }) {
  if (mode === "day") return getDayContent(day);
  if (mode === "library") return getLibraryContent({ report, slug });

  return getReportingContent({ report, slug });
}

function getReportingContent({ report, slug }) {
  const reportingLink = (report.nutritionReportingLinks ?? []).find(
    (item) => item.id === slug
  );
  const title = reportingLink?.label ?? "Nutrition Report";

  return {
    eyebrow: "Reporting",
    title,
    summary:
      reportingLink?.detail ??
      "This reporting area will organize nutrition patterns over time.",
    sections: [
      <Card className="space-y-2" key="foundation">
        <h2 className="text-lg font-extrabold text-slate-950">Foundation</h2>
        <p className="text-sm font-semibold leading-6 text-slate-500">
          This page is a permanent destination for nutrition history. It will
          grow into trends, comparisons, goal impact, and adherence views as
          more nutrition days are added.
        </p>
      </Card>,
    ],
  };
}

function getLibraryContent({ report, slug = [] }) {
  const path = Array.isArray(slug) ? slug : [slug].filter(Boolean);
  const title = path.length ? toTitle(path.at(-1)) : "Nutrition Areas";
  const children = getLibraryChildren({ path, report });

  return {
    eyebrow: "Nutrition Areas",
    title,
    summary:
      "Explore nutrition by calories, macros, meals, micronutrients, supplements, and hydration.",
    sections: [
      <Card className="space-y-3" key="library">
        <h2 className="text-lg font-extrabold text-slate-950">Browse</h2>
        <div className="space-y-2">
          {children.length > 0 ? (
            children.map((item) => (
              <Link
                className="flex items-center justify-between rounded-[12px] bg-[var(--surface-muted)] p-3"
                href={item.href}
                key={item.href}
              >
                <div>
                  <p className="text-sm font-extrabold text-slate-950">
                    {item.label}
                  </p>
                  {item.detail && (
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      {item.detail}
                    </p>
                  )}
                </div>
                <span className="text-sm font-extrabold text-indigo-600">
                  &gt;
                </span>
              </Link>
            ))
          ) : (
            <p className="text-sm font-semibold leading-6 text-slate-500">
              More detailed nutrition browsing will appear as food and meal
              history grows.
            </p>
          )}
        </div>
      </Card>,
    ],
  };
}

function getDayContent(day) {
  if (!day) {
    return {
      eyebrow: "Nutrition Detail",
      title: "Nutrition day not found",
      summary: "This nutrition record is not available.",
      sections: [],
    };
  }

  return {
    eyebrow: "Nutrition Detail",
    title: day.label,
    summary: `${day.value} / ${formatDate(day.date)}`,
    sections: [
      <Card className="space-y-3" key="summary">
        <h2 className="text-lg font-extrabold text-slate-950">Summary</h2>
        {day.detail && (
          <p className="text-sm font-semibold leading-6 text-slate-500">
            {day.detail}
          </p>
        )}
        {day.sourceEvidence?.length > 0 && (
          <p className="text-xs font-bold text-slate-400">
            Source: {day.sourceEvidence.join(" + ")}
          </p>
        )}
      </Card>,
      day.totals && Object.keys(day.totals).length > 0 && (
        <Card className="space-y-3" key="totals">
          <h2 className="text-lg font-extrabold text-slate-950">Totals</h2>
          <div className="grid grid-cols-2 gap-2">
            {getFeaturedNutritionTotals(day.totals).map(([key, value]) => (
              <div
                className="rounded-[12px] bg-[var(--surface-muted)] p-3"
                key={key}
              >
                <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400">
                  {toTitle(key)}
                </p>
                <p className="mt-1 text-sm font-extrabold text-slate-950">
                  {formatValue(value)}
                </p>
              </div>
            ))}
          </div>
        </Card>
      ),
      day.meals?.length > 0 && (
        <Card className="space-y-3" key="meals">
          <h2 className="text-lg font-extrabold text-slate-950">Meals</h2>
          {day.meals.map((meal) => (
            <details
              className="rounded-[12px] bg-[var(--surface-muted)] p-3"
              key={meal.id ?? meal.name}
            >
              <summary className="cursor-pointer list-none">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-extrabold text-slate-950">
                      {meal.name ?? "Meal"}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      {formatMealSummary(meal)}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-extrabold text-indigo-600">
                    View
                  </span>
                </div>
              </summary>
              <MealDetail meal={meal} />
            </details>
          ))}
        </Card>
      ),
    ].filter(Boolean),
  };
}

function MealDetail({ meal }) {
  const totals = getFeaturedNutritionTotals(meal.totals ?? {});
  const foods = meal.foods ?? [];
  const provenance = getProvenanceLabels(meal);

  return (
    <div className="mt-3 space-y-3 border-t border-[var(--divider)] pt-3">
      {meal.completeness && (
        <div className="rounded-[10px] bg-white/70 p-3">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400">
            Current understanding
          </p>
          <p className="mt-1 text-sm font-extrabold text-slate-950">
            {formatMealUnderstanding(meal)}
          </p>
        </div>
      )}

      {totals.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {totals.map(([key, value]) => (
            <div className="rounded-[10px] bg-white/70 p-3" key={key}>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400">
                {toTitle(key)}
              </p>
              <p className="mt-1 text-sm font-extrabold text-slate-950">
                {formatNutritionMetric(key, value)}
              </p>
            </div>
          ))}
        </div>
      )}

      {foods.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-slate-400">
            Foods
          </p>
          {foods.map((food) => (
            <div
              className="rounded-[10px] bg-white/70 p-3"
              key={food.id ?? food.canonical_name ?? food.name}
            >
              <p className="text-sm font-extrabold text-slate-950">
                {food.canonical_name ?? food.name ?? "Food"}
              </p>
              {food.brand && (
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {food.brand}
                </p>
              )}
              {formatFoodServing(food) && (
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {formatFoodServing(food)}
                </p>
              )}
              <FoodNutrients food={food} />
              {getProvenanceLabels(food).length > 0 && (
                <p className="mt-2 text-xs font-bold text-slate-400">
                  Source: {getProvenanceLabels(food).join(" + ")}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {Number.isFinite(Number(meal.additional_foods_detected)) &&
        Number(meal.additional_foods_detected) > 0 && (
          <p className="rounded-[10px] bg-white/70 p-3 text-xs font-semibold leading-5 text-slate-500">
            PhysiqueOS confidently identified {foods.length || "some"} food
            {foods.length === 1 ? "" : "s"} in this meal. Additional foods may
            be present and will be included as more complete evidence becomes
            available.
          </p>
        )}

      {provenance.length > 0 && (
        <p className="text-xs font-bold text-slate-400">
          Source: {provenance.join(" + ")}
        </p>
      )}
    </div>
  );
}

function FoodNutrients({ food }) {
  const nutrients = getFeaturedNutritionTotals(food.nutrients ?? {});

  if (nutrients.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {nutrients.map(([key, value]) => (
        <span
          className="rounded-full bg-[var(--surface-muted)] px-2 py-1 text-[11px] font-bold text-slate-600"
          key={key}
        >
          {toTitle(key)}: {formatNutritionMetric(key, value)}
        </span>
      ))}
    </div>
  );
}

function getLibraryChildren({ path, report }) {
  if (path.length === 0) return report.nutritionLibrary ?? [];

  if (path[0] === "meals") {
    return [
      {
        detail: "Meal timing, totals, foods, and completeness.",
        href: "/progress/nutrition/library/meals/days",
        label: "Meal History",
      },
    ];
  }

  if (path[0] === "macros") {
    return [
      {
        detail: "Protein intake and food contributors.",
        href: "/progress/nutrition/library/macros/protein",
        label: "Protein",
      },
      {
        detail: "Carbohydrate intake, timing, and food contributors.",
        href: "/progress/nutrition/library/macros/carbohydrates",
        label: "Carbohydrates",
      },
      {
        detail: "Fat intake and food contributors.",
        href: "/progress/nutrition/library/macros/fat",
        label: "Fat",
      },
    ];
  }

  return [];
}

function formatDate(value) {
  if (!value) return "Pending";

  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  const date =
    year && month && day ? new Date(year, month - 1, day) : new Date(value);

  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatValue(value) {
  if (typeof value === "number") return String(value);
  if (value?.value && value?.unit) return `${value.value} ${value.unit}`;

  return String(value ?? "Pending");
}

function getFeaturedNutritionTotals(totals = {}) {
  const featuredKeys = ["calories", "protein_g", "carbs_g", "fat_g", "fiber_g"];

  return featuredKeys
    .filter((key) => totals[key] !== null && totals[key] !== undefined && totals[key] !== "")
    .map((key) => [key, totals[key]]);
}

function formatMealSummary(meal = {}) {
  const totals = meal.totals ?? {};
  const parts = [
    totals.calories ? `${totals.calories} calories` : null,
    totals.protein_g ? `${totals.protein_g}g protein` : null,
    totals.carbs_g ? `${totals.carbs_g}g carbs` : null,
    totals.fat_g ? `${totals.fat_g}g fat` : null,
    meal.foods?.length ? `${meal.foods.length} food${meal.foods.length === 1 ? "" : "s"}` : null,
  ].filter(Boolean);

  return parts.join(" / ") || "Meal details";
}

function formatMealUnderstanding(meal = {}) {
  if (/partial/i.test(String(meal.completeness ?? ""))) {
    return "Partial meal identified.";
  }

  if (/complete/i.test(String(meal.completeness ?? ""))) {
    return "Meal identified.";
  }

  return "Meal evidence available.";
}

function formatNutritionMetric(key, value) {
  if (value === null || value === undefined || value === "") return "Pending";

  if (key === "calories") return `${value} cal`;
  if (/_g$/.test(key)) return `${value}g`;
  if (/_mg$/.test(key)) return `${value}mg`;

  return formatValue(value);
}

function formatFoodServing(food = {}) {
  return [food.serving_size, food.servings ? `${food.servings} servings` : null]
    .filter(Boolean)
    .join(" / ");
}

function getProvenanceLabels(value = {}) {
  return [
    ...(value.provenance?.source_artifact_refs ?? []),
    value.provenance_ref,
  ]
    .filter(Boolean)
    .map(formatSourceLabel)
    .filter(Boolean)
    .filter((label, index, labels) => labels.indexOf(label) === index);
}

function formatSourceLabel(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (/typed_evidence/i.test(text)) return "Typed evidence";
  if (/\.(png|jpe?g|webp)$/i.test(text) || /screenshot|img_/i.test(text)) {
    return "Screenshot";
  }

  return toTitle(text);
}

function toTitle(value) {
  return String(value ?? "")
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
