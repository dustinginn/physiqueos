export function resolveExecutionSupportLabel(item = {}) {
  if (item.supportStrategyLabel) return item.supportStrategyLabel;
  if (item.id === "execution_progress_photos") {
    return "Supports your Progress Photos Strategy";
  }

  const strategyId = item.linkedStrategyIds?.[0] ?? "";
  if (strategyId.includes("energy")) return "Supports your Energy Strategy";
  if (strategyId.includes("training")) return "Supports Training and Recovery";
  if (strategyId === "recovery") return "Supports recovery";
  return "Helps PhysiqueOS track progress toward the current goal";
}
