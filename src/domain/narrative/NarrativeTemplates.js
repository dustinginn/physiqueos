const FORECAST_SUMMARY = Object.freeze({
  ahead_of_forecast: "Progress is ahead of the expected path.",
  on_forecast: "Progress remains aligned with the planned path.",
  forecast_uncertain: "The outlook remains uncertain while material questions are unresolved.",
  forecast_at_risk: "Progress is at risk under the current strategy and timeline.",
  forecast_unlikely: "Success is unlikely within the current strategy and timeline.",
});

const MOVEMENT = Object.freeze({
  increase: "Confidence increased because the outlook materially strengthened.",
  decrease: "Confidence decreased because the outlook materially weakened.",
  no_meaningful_change: "Confidence remained stable because the outlook did not materially change.",
});

const COACHING = Object.freeze({
  stay_the_course: "Stay with the current strategy while progress remains favorable.",
  continue_calibration: "Continue calibration until the unresolved questions become decidable.",
  monitor_closely: "Keep the current strategy steady while watching the rate of change closely.",
  prepare_adjustment: "Prepare a strategy adjustment if the forecast risk remains unresolved.",
  strategy_review_recommended: "Review the current strategy before relying on it for success.",
});

const FACTORS = Object.freeze({
  objective_ahead: "Measured progress is ahead of the expected trajectory.",
  objective_on_track: "Measured progress is consistent with the expected trajectory.",
  objective_uncertain: "The primary outcome remains uncertain.",
  objective_behind: "Measured progress is below the expected trajectory.",
  objective_contradicted: "The current result conflicts with the expected trajectory.",
  guardrails_clear: "The accepted boundaries remain clear.",
  guardrails_watch: "An accepted boundary requires continued observation.",
  guardrails_pressured: "An accepted boundary is materially pressured.",
  guardrails_violated: "A required boundary has been crossed.",
  strategy_confirmed: "The current strategy is supported across all expected responses.",
  strategy_directionally_supported: "The current strategy is directionally supported but not fully confirmed.",
  strategy_still_calibrating: "The current strategy is still being calibrated.",
  strategy_mixed: "The current strategy has material supporting and contradicting conclusions.",
  strategy_contradicted: "The current strategy hypothesis is contradicted.",
  agreement_strong_convergence: "The available signals have strong agreement.",
  agreement_moderate_convergence: "The available signals have moderate agreement.",
  agreement_mixed: "The available signals have mixed agreement.",
  agreement_conflicting: "The available signals materially conflict.",
  agreement_insufficient: "Agreement cannot yet be established.",
  quality_robust: "The available assessment quality is robust.",
  quality_adequate: "The available assessment quality is adequate.",
  quality_limited: "The available assessment quality is limited.",
  quality_insufficient: "The available assessment quality is insufficient.",
  timeline_overdue: "The planned timeline has elapsed.",
  timeline_unknown: "The remaining timeline is unknown.",
  timeline_not_started: "The timeline has not started.",
});

const UNCERTAINTY = Object.freeze({
  elapsed_time: "More elapsed time is required before the question can be resolved.",
  measurement_pending: "A required outcome measurement remains pending.",
  comparison_missing: "A valid comparison remains unavailable.",
  coverage_limited: "The observation window remains incomplete.",
  execution_ambiguous: "Strategy execution exposure remains ambiguous.",
  signal_conflict: "Material interpreted conclusions remain in conflict.",
  attribution: "Observed change cannot yet be attributed to the current strategy.",
  measurement_precision: "Available measurement precision does not resolve the question.",
  goal_semantics_missing: "Required success criteria remain undefined.",
  unresolved_guardrail_risk: "A boundary risk remains unresolved.",
});

export function forecastSummaryText(status) {
  return FORECAST_SUMMARY[status] ?? null;
}

export function movementText(direction) {
  return MOVEMENT[direction] ?? null;
}

export function coachingText(direction) {
  return COACHING[direction] ?? null;
}

export function factorText(code) {
  if (FACTORS[code]) return FACTORS[code];
  if (code.startsWith("milestone_supported:")) {
    return "A planned checkpoint has been supported.";
  }
  if (code.startsWith("milestone_due_unresolved:")) {
    return "A planned checkpoint is due and remains unresolved.";
  }
  if (code.startsWith("milestone_overdue_unresolved:")) {
    return "A required checkpoint is overdue and unresolved.";
  }
  if (code.startsWith("milestone_contradicted:")) {
    return "A planned checkpoint has a contradicting result.";
  }
  return null;
}

export function uncertaintyText(kind) {
  return UNCERTAINTY[kind] ?? null;
}

export function nextEvidenceText(value = {}) {
  if (value.status === "not_required") {
    return "No additional decisive evidence is currently required.";
  }
  if (value.status === "identified" && value.evidenceCapability) {
    if (value.expectedEventType === "dexa_scan") {
      return "The next consistently prepared DEXA will show whether the early response is durable while photos and weight keep the rate of gain under review.";
    }
    return "The next scheduled check is expected to reduce the primary remaining uncertainty.";
  }
  if (value.status === "unavailable") {
    return "No scheduled check can currently resolve the primary uncertainty.";
  }
  return null;
}
