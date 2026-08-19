import { describe, expect, it } from "vitest";
import { createUnavailableWorkerControl, assertCombinedCutoverWorkerControl, WorkerState, WorkerErrorCode } from "./combinedCutoverWorkerControl.js";
import { createDeterministicCombinedCutoverWorkerControl } from "./testSupport/deterministicWorkerControl.js";

describe("assertCombinedCutoverWorkerControl", () => {
  it("accepts a fully-shaped implementation", () => {
    expect(() => assertCombinedCutoverWorkerControl(createDeterministicCombinedCutoverWorkerControl())).not.toThrow();
    expect(() => assertCombinedCutoverWorkerControl(createUnavailableWorkerControl())).not.toThrow();
  });

  it("rejects a partial implementation missing a required operation", () => {
    expect(() => assertCombinedCutoverWorkerControl({ inspectWorkerState: async () => ({}) })).toThrow();
  });
});

describe("createUnavailableWorkerControl", () => {
  it("every operation throws WORKER_CONTROL_UNAVAILABLE, never a silent success", async () => {
    const control = createUnavailableWorkerControl();
    for (const op of ["inspectWorkerState", "activateProviderWorkers", "verifyProviderWorkers", "retireWindowsWorkers", "restoreWindowsWorkers"]) {
      await expect(control[op]({})).rejects.toMatchObject({ code: WorkerErrorCode.UNAVAILABLE });
    }
  });

  it("carries a custom reason when supplied", async () => {
    const control = createUnavailableWorkerControl({ reason: "no provider deployment yet" });
    await expect(control.activateProviderWorkers({})).rejects.toThrow("no provider deployment yet");
  });
});

describe("createDeterministicCombinedCutoverWorkerControl", () => {
  it("activates, verifies, retires Windows, and restores Windows in sequence", async () => {
    const control = createDeterministicCombinedCutoverWorkerControl();
    expect(control.currentWorkerState()).toBe(WorkerState.WINDOWS_ACTIVE);
    await control.activateProviderWorkers({ operationId: "op-1", providerDeploymentId: "deployment-1" });
    expect(control.currentWorkerState()).toBe(WorkerState.PROVIDER_ACTIVE);
    await expect(control.verifyProviderWorkers({ operationId: "op-1" })).resolves.toMatchObject({ ready: true });
    await expect(control.retireWindowsWorkers({ operationId: "op-1" })).resolves.toMatchObject({ retired: true });
    await control.restoreWindowsWorkers({ operationId: "op-1" });
    expect(control.currentWorkerState()).toBe(WorkerState.WINDOWS_ACTIVE);
  });

  it("verification fails honestly when the provider worker was never activated", async () => {
    const control = createDeterministicCombinedCutoverWorkerControl();
    await expect(control.verifyProviderWorkers({})).rejects.toMatchObject({ code: WorkerErrorCode.VERIFICATION_FAILED });
  });

  it("supports configurable failures for each operation", async () => {
    const control = createDeterministicCombinedCutoverWorkerControl({
      failActivateWith: new Error("activate boom"), failVerifyWith: new Error("verify boom"),
      failRetireWith: new Error("retire boom"), failRestoreWith: new Error("restore boom"),
    });
    await expect(control.activateProviderWorkers({})).rejects.toThrow("activate boom");
    await expect(control.verifyProviderWorkers({})).rejects.toThrow("verify boom");
    await expect(control.retireWindowsWorkers({})).rejects.toThrow("retire boom");
    await expect(control.restoreWindowsWorkers({})).rejects.toThrow("restore boom");
  });

  it("activation is idempotent - a second call while already provider-active is a safe replay", async () => {
    const control = createDeterministicCombinedCutoverWorkerControl({ initialWorkerState: WorkerState.PROVIDER_ACTIVE });
    const result = await control.activateProviderWorkers({ operationId: "op-1", providerDeploymentId: "deployment-1" });
    expect(result.outcome).toBe("idempotent-replay");
  });

  it("records every call for inspection", async () => {
    const control = createDeterministicCombinedCutoverWorkerControl();
    await control.inspectWorkerState({ operationId: "op-1" });
    expect(control.inspectCalls()).toEqual([{ op: "inspect", operationId: "op-1" }]);
  });
});
