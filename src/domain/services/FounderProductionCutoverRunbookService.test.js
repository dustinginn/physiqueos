import { describe, expect, it } from "vitest";
import { createFounderProductionCutoverRunbookDefinition,
  validateFounderProductionCutoverRunbook } from
  "./FounderProductionCutoverRunbookService";

describe("Founder production cutover runbook", () => {
  it("enforces freeze, backup, seven commits, restart, dry runs, and no real decision", () => {
    const runbook = createFounderProductionCutoverRunbookDefinition();
    const ids = runbook.steps.map((item) => item.id);
    expect(ids.indexOf("verify_write_freeze")).toBeLessThan(ids.indexOf("create_byte_backup"));
    expect(ids.indexOf("create_byte_backup")).toBeLessThan(ids.indexOf("repair_phase_dates"));
    expect(ids.indexOf("repair_phase_dates")).toBeLessThan(ids.indexOf("seed_strategy_draft"));
    expect(ids.indexOf("accept_strategy")).toBeLessThan(ids.indexOf("seed_trajectory_draft"));
    expect(ids.indexOf("accept_trajectory")).toBeLessThan(ids.indexOf("start_canonical_runtime"));
    expect(ids.at(-1)).toBe("leave_real_phase_decision_uncommitted");
    expect(runbook.confidenceBoundary).toBe("v2_already_canonical_preserve_existing_lineage");
    expect(runbook.deploymentBoundary).toBe("reviewed_isolated_source_only");
    expect(runbook.writerBoundary).toBe("canonical_production_runtime_only_before_stop");
    expect(runbook.ngrokBoundary).toBe("preserve_running_pid_url_upstream_config_and_task");
    expect(ids.indexOf("verify_deployment_identity")).toBeLessThan(ids.indexOf("stop_canonical_runtime"));
    expect(ids.indexOf("verify_development_server_absent")).toBeLessThan(ids.indexOf("stop_canonical_runtime"));
    expect(ids.indexOf("verify_ngrok_running_baseline")).toBeLessThan(ids.indexOf("stop_canonical_runtime"));
    expect(runbook.actualPhaseDecisionAuthorized).toBe(false);
  });

  it("rejects reordered dependencies and missing high-risk confirmations", () => {
    const valid = structuredClone(createFounderProductionCutoverRunbookDefinition().steps);
    const repair = valid.find((item) => item.id === "repair_phase_dates");
    repair.explicitConfirmationRequired = false;
    expect(() => validateFounderProductionCutoverRunbook(valid)).toThrow(/confirmation/i);
    const reordered = structuredClone(createFounderProductionCutoverRunbookDefinition().steps);
    const backup = reordered.find((item) => item.id === "create_byte_backup");
    backup.dependsOn = ["repair_phase_dates"];
    expect(() => validateFounderProductionCutoverRunbook(reordered)).toThrow(/dependency order/i);
    const missingCheckpoint = structuredClone(createFounderProductionCutoverRunbookDefinition().steps)
      .filter((item) => item.id !== "verify_ngrok_running_baseline");
    const capture = missingCheckpoint.find((item) => item.id === "capture_live_baseline");
    capture.dependsOn = capture.dependsOn.filter((item) => item !== "verify_ngrok_running_baseline");
    expect(() => validateFounderProductionCutoverRunbook(missingCheckpoint))
      .toThrow(/Checkpoint A/i);
  });
});
