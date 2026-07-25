export const ENERGY_METRIC_VALUE_CLASSES = Object.freeze({
  intake: "text-[var(--energy-intake)]",
  expenditure: "text-[var(--energy-expenditure)]",
  balance: "font-black text-[var(--energy-balance)]",
  neutral: "text-[var(--text-secondary)]",
});

export function getEnergyMetricValueClass(metric, value) {
  if (value == null || !Number.isFinite(Number(value))) {
    return ENERGY_METRIC_VALUE_CLASSES.neutral;
  }
  return (
    ENERGY_METRIC_VALUE_CLASSES[metric] ??
    ENERGY_METRIC_VALUE_CLASSES.neutral
  );
}
