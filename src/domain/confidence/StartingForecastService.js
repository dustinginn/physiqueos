export const STARTING_FORECAST_CONTEXT_VERSION = "starting_forecast_context_v2";

const VALUES = Object.freeze({
  goalAmbition: ["low", "moderate", "high"],
  timelineFeasibility: ["generous", "reasonable", "compressed", "unknown"],
  baselineQuality: ["known", "partial", "missing"],
  priorGoalHistory: ["strong", "mixed", "weak", "unavailable"],
  historicalExecution: ["strong", "adequate", "mixed", "weak", "unavailable"],
  strategyQuality: ["strong", "adequate", "incomplete", "unknown"],
  experience: ["new_user", "experienced_user"],
});

export function createStartingForecastContext(input = {}) {
  const result = { schemaVersion: STARTING_FORECAST_CONTEXT_VERSION };
  for (const [key, allowed] of Object.entries(VALUES)) {
    const value = input[key] ?? defaultValue(key);
    if (!allowed.includes(value)) throw new Error(`Starting Forecast ${key} is invalid.`);
    result[key] = value;
  }
  const missingInformation = [...new Set(input.missingInformation ?? [])]
    .filter((item) => typeof item === "string" && item.trim()).sort();
  result.missingInformation = missingInformation;
  result.missingInformationCount = missingInformation.length;
  result.priorGoalRefs = [...new Set(input.priorGoalRefs ?? [])].sort();
  result.historyRefs = [...new Set(input.historyRefs ?? [])].sort();
  return deepFreeze(result);
}

function defaultValue(key) {
  return ({
    goalAmbition: "moderate",
    timelineFeasibility: "unknown",
    baselineQuality: "partial",
    priorGoalHistory: "unavailable",
    historicalExecution: "unavailable",
    strategyQuality: "unknown",
    experience: "new_user",
  })[key];
}
function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
