export const CoordinatorStep = Object.freeze({
  A: "A", B: "B", C_D: "C_D", E: "E", F_G: "F_G", H_I_J: "H_I_J",
  K: "K", L: "L", M: "M", N_O: "N_O", P: "P", COMPLETE: "COMPLETE",
});

export const COORDINATOR_STEP_ORDER = Object.freeze([
  CoordinatorStep.A, CoordinatorStep.B, CoordinatorStep.C_D, CoordinatorStep.E,
  CoordinatorStep.F_G, CoordinatorStep.H_I_J, CoordinatorStep.K, CoordinatorStep.L,
  CoordinatorStep.M, CoordinatorStep.N_O, CoordinatorStep.P,
]);

export const CoordinatorStepStatus = Object.freeze({
  NOT_STARTED: "NOT_STARTED",
  IN_PROGRESS_OR_UNRESOLVED: "IN_PROGRESS_OR_UNRESOLVED",
  COMPLETED: "COMPLETED",
  FAILED_CONCLUSIVE: "FAILED_CONCLUSIVE",
  FAILED_AMBIGUOUS: "FAILED_AMBIGUOUS",
  BLOCKED_PRECONDITION: "BLOCKED_PRECONDITION",
  IRREVERSIBLE_BOUNDARY_CROSSED: "IRREVERSIBLE_BOUNDARY_CROSSED",
  ABORTED_TO_WINDOWS: "ABORTED_TO_WINDOWS",
  PROVIDER_FORWARD_RECOVERY: "PROVIDER_FORWARD_RECOVERY",
});

export const CoordinatorInspectionClassification = Object.freeze({
  COMPLETED: "COMPLETED",
  NOT_APPLIED: "NOT_APPLIED",
  AMBIGUOUS: "AMBIGUOUS",
  BLOCKED: "BLOCKED",
  FAILED: "FAILED",
});

export const CoordinatorErrorCode = Object.freeze({
  RUN_CONFLICT: "COORDINATOR_RUN_CONFLICT",
  RUN_NOT_FOUND: "COORDINATOR_RUN_NOT_FOUND",
  STALE_STATE: "COORDINATOR_STALE_STATE",
  AUTHORIZATION_REQUIRED: "COORDINATOR_AUTHORIZATION_REQUIRED",
  AUTHORIZATION_STALE: "COORDINATOR_AUTHORIZATION_STALE",
  PRECONDITION_BLOCKED: "COORDINATOR_PRECONDITION_BLOCKED",
  OUTCOME_AMBIGUOUS: "COORDINATOR_OUTCOME_AMBIGUOUS",
  IDENTITY_MISMATCH: "COORDINATOR_IDENTITY_MISMATCH",
  SNAPSHOT_CONFLICT: "COORDINATOR_B_SNAPSHOT_CONFLICT",
  FIRST_WRITE_AMBIGUOUS: "COORDINATOR_FIRST_WRITE_AMBIGUOUS",
  ROLLBACK_ILLEGAL: "COORDINATOR_ROLLBACK_ILLEGAL",
});

export const FOUNDER_AUTHORIZATION_STEPS = Object.freeze([
  CoordinatorStep.B, CoordinatorStep.L, CoordinatorStep.M, CoordinatorStep.N_O,
  "RECOVER_TO_WINDOWS", "PROVIDER_FORWARD_RECOVERY",
]);

export const EXPANDED_AP_STEPS = Object.freeze({
  A: Object.freeze(["A"]), B: Object.freeze(["B"]), C_D: Object.freeze(["C", "D"]),
  E: Object.freeze(["E"]), F_G: Object.freeze(["F", "G"]), H_I_J: Object.freeze(["H", "I", "J"]),
  K: Object.freeze(["K"]), L: Object.freeze(["L"]), M: Object.freeze(["M"]),
  N_O: Object.freeze(["N", "O"]), P: Object.freeze(["P"]),
});

export function coordinatorError(code, message, evidence = {}) {
  return Object.assign(new Error(message), { code, evidence: freeze(evidence) });
}

export function requireRunId(value, field = "runId") {
  const candidate = String(value ?? "").trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9:_-]{7,127}$/.test(candidate)) {
    throw coordinatorError(CoordinatorErrorCode.IDENTITY_MISMATCH, `${field} is invalid.`);
  }
  return candidate;
}

export function nextCoordinatorStep(completedSteps) {
  const complete = new Set(Array.isArray(completedSteps) ? completedSteps : []);
  return COORDINATOR_STEP_ORDER.find((step) => !complete.has(step)) ?? CoordinatorStep.COMPLETE;
}

export function freeze(value) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return Object.freeze(value.map(freeze));
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, freeze(entry)])));
}
