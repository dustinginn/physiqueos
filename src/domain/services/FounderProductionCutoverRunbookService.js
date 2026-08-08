import { FOUNDER_CUTOVER_STAGE_ORDER } from "./FounderProductionCutoverService";

export const FOUNDER_CUTOVER_RUNBOOK_VERSION = "founder_production_cutover_runbook_v2";

export function createFounderProductionCutoverRunbookDefinition() {
  const steps = [
    step("freeze_coordination", "read_only", []),
    step("verify_deployment_identity", "read_only", ["freeze_coordination"]),
    step("verify_development_server_absent", "read_only", ["freeze_coordination"]),
    step("verify_ngrok_running_baseline", "read_only", ["freeze_coordination"]),
    step("capture_live_baseline", "read_only", ["verify_deployment_identity",
      "verify_development_server_absent", "verify_ngrok_running_baseline"]),
    step("stop_canonical_runtime", "runtime_change", ["capture_live_baseline"], true),
    step("verify_write_freeze", "read_only", ["stop_canonical_runtime"]),
    step("create_byte_backup", "backup_write", ["verify_write_freeze"], true),
    step("verify_byte_backup", "read_only", ["create_byte_backup"]),
    step("build_application", "build_write", ["verify_byte_backup"]),
    ...FOUNDER_CUTOVER_STAGE_ORDER.map((stage, index) => step(stage, "founder_write",
      [index === 0 ? "build_application" : FOUNDER_CUTOVER_STAGE_ORDER[index - 1]], true)),
    step("verify_activation_package", "read_only",
      [FOUNDER_CUTOVER_STAGE_ORDER.at(-1)]),
    step("start_canonical_runtime", "runtime_change", ["verify_activation_package"], true),
    step("verify_runtime_ownership", "read_only", ["start_canonical_runtime"]),
    step("verify_read_surfaces", "read_only", ["verify_runtime_ownership"]),
    step("accept_existing_v2_lineage", "read_only", ["verify_read_surfaces"]),
    step("dry_run_continue_phase_1", "lock_only_dry_run", ["accept_existing_v2_lineage"], true),
    step("dry_run_begin_phase_2", "lock_only_dry_run", ["dry_run_continue_phase_1"], true),
    step("separate_phase_review_ui_patch", "future_patch", ["dry_run_begin_phase_2"], true),
    step("leave_real_phase_decision_uncommitted", "stop_condition",
      ["separate_phase_review_ui_patch"]),
  ];
  validateFounderProductionCutoverRunbook(steps);
  return deepFreeze({ version: FOUNDER_CUTOVER_RUNBOOK_VERSION, steps,
    confidenceBoundary: "v2_already_canonical_preserve_existing_lineage",
    deploymentBoundary: "reviewed_isolated_source_only",
    writerBoundary: "canonical_production_runtime_only_before_stop",
    ngrokBoundary: "preserve_running_pid_url_upstream_config_and_task",
    actualPhaseDecisionAuthorized: false, automaticAllInOneOperation: false });
}

export function validateFounderProductionCutoverRunbook(steps) {
  if (!Array.isArray(steps) || !steps.length) throw runbookError("Runbook steps are required.");
  const ids = steps.map((item) => item.id);
  if (new Set(ids).size !== ids.length) throw runbookError("Runbook step IDs must be unique.");
  steps.forEach((item, index) => {
    item.dependsOn.forEach((dependency) => {
      const dependencyIndex = ids.indexOf(dependency);
      if (dependencyIndex < 0 || dependencyIndex >= index)
        throw runbookError(`Runbook dependency order is invalid: ${item.id}.`);
    });
    if (["founder_write", "runtime_change", "backup_write", "lock_only_dry_run", "future_patch"]
      .includes(item.effect) && item.explicitConfirmationRequired !== true)
      throw runbookError(`High-risk step lacks explicit confirmation: ${item.id}.`);
  });
  const stageIndexes = FOUNDER_CUTOVER_STAGE_ORDER.map((stage) => ids.indexOf(stage));
  if (stageIndexes.some((index) => index < 0) ||
      stageIndexes.some((index, position) => position > 0 && index <= stageIndexes[position - 1]))
    throw runbookError("Founder cutover stage order is invalid.");
  if (ids.indexOf("create_byte_backup") > ids.indexOf(FOUNDER_CUTOVER_STAGE_ORDER[0]))
    throw runbookError("Backup must precede the first Founder write.");
  if (ids.indexOf("verify_write_freeze") > ids.indexOf("create_byte_backup"))
    throw runbookError("Write freeze must precede backup.");
  for (const required of ["verify_deployment_identity",
    "verify_development_server_absent", "verify_ngrok_running_baseline"]) {
    if (ids.indexOf(required) < 0 || ids.indexOf(required) > ids.indexOf("stop_canonical_runtime"))
      throw runbookError(`Checkpoint A precondition is missing or late: ${required}.`);
  }
  if (ids.indexOf("start_canonical_runtime") < ids.indexOf(FOUNDER_CUTOVER_STAGE_ORDER.at(-1)))
    throw runbookError("Runtime must remain stopped through repair and activation-package commits.");
  if (ids.at(-1) !== "leave_real_phase_decision_uncommitted")
    throw runbookError("Runbook must end without a real Phase Review decision.");
  return true;
}

function step(id, effect, dependsOn, explicitConfirmationRequired = false) {
  return { id, effect, dependsOn, explicitConfirmationRequired };
}
function runbookError(message) { const error = new Error(message);
  error.code = "FOUNDER_CUTOVER_RUNBOOK_INVALID"; return error; }
function deepFreeze(value) { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze); return Object.freeze(value); }
