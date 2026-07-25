import { getNutritionMealSlotPresentation } from "../../presentation/nutritionMealPresentation";

export default function NutritionMealDistributionChart({ distribution }) {
  const maximum = Math.max(...distribution.map((item) => item.averageCalories ?? 0), 1);
  return (
    <figure aria-label="Average calories by meal">
      <div className="flex h-44 items-end gap-3 rounded-[14px] bg-[var(--chart-bg)] px-3 pb-3 pt-5">
        {distribution.map((item) => {
          const appearance = getNutritionMealSlotPresentation(item.slot);
          return (
            <div className="flex min-w-0 flex-1 flex-col items-center gap-1" key={item.slot}>
              <span className="text-[11px] font-extrabold text-[var(--text-primary)]">
                {item.averageCalories == null ? "—" : item.averageCalories}
              </span>
              <span className="flex h-24 w-full items-end justify-center">
                <span
                  className="block w-9 max-w-full rounded-t-[6px]"
                  style={{
                    backgroundColor: appearance.color,
                    height: item.averageCalories == null
                      ? "0%"
                      : `${Math.max(6, item.averageCalories / maximum * 100)}%`,
                  }}
                />
              </span>
              <span className={`truncate text-[9px] font-extrabold ${appearance.foregroundClassName}`}>
                {appearance.label}
              </span>
              <span className="text-[8px] font-bold text-[var(--text-subtle)]">
                {item.occurrenceCount}×
              </span>
            </div>
          );
        })}
      </div>
    </figure>
  );
}
