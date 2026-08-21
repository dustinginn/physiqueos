import { describe, expect, it, vi } from "vitest";
import {
  createDigitalOceanMutationReconciler,
  pollExactDigitalOceanAction,
  pollExactDigitalOceanDeployment,
  pollExactProviderResource,
} from "./DigitalOceanMutationReconciler.js";
import {
  ProviderPollClassification,
  ProviderReadbackClassification,
  ProviderResultClassification,
  providerFailure,
} from "./DigitalOceanProviderContract.js";

const operationIdentity = Object.freeze({ operationId: "operation-1", commandId: "command-1" });
const acceptedMutation = Object.freeze({
  classification: ProviderResultClassification.REQUEST_ACCEPTED,
  evidence: Object.freeze({ providerResourceId: "record-1" }),
});

describe("DigitalOceanMutationReconciler", () => {
  it("reads back an accepted mutation and classifies intended state as proven applied", async () => {
    const mutate = vi.fn(async () => acceptedMutation);
    const readCurrent = vi.fn(async () => ({ value: { data: "provider.example" } }));
    const reconciler = fixture();
    const result = await reconciler.execute({
      resourceKey: "domain-record:1", operationIdentity, mutate, readCurrent,
      classifyReadback: (record) => record.data === "provider.example" ? ProviderReadbackClassification.PROVEN_APPLIED : ProviderReadbackClassification.PROVEN_NOT_APPLIED,
    });
    expect(result).toMatchObject({
      classification: ProviderResultClassification.REQUEST_ACCEPTED,
      readbackClassification: ProviderReadbackClassification.PROVEN_APPLIED,
      mutationWasAmbiguous: false,
      readAttempts: 1,
    });
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(readCurrent).toHaveBeenCalledTimes(1);
    expect(reconciler.hasUnresolvedMutation("domain-record:1")).toBe(false);
  });

  it("uses bounded readback after an ambiguous mutation and never retries the mutation", async () => {
    const mutate = vi.fn(async () => { throw ambiguous(); });
    const readCurrent = vi.fn()
      .mockResolvedValueOnce({ value: null })
      .mockResolvedValueOnce({ value: { data: "provider.example" } });
    const result = await fixture({ maximumReadbackAttempts: 2 }).execute({
      resourceKey: "domain-record:1", operationIdentity, mutate, readCurrent,
      classifyReadback: (record) => record?.data === "provider.example"
        ? ProviderReadbackClassification.PROVEN_APPLIED
        : ProviderReadbackClassification.STILL_AMBIGUOUS,
    });
    expect(result).toMatchObject({
      classification: ProviderResultClassification.REQUEST_ACCEPTED,
      readbackClassification: ProviderReadbackClassification.PROVEN_APPLIED,
      mutationWasAmbiguous: true,
      readAttempts: 2,
    });
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(readCurrent).toHaveBeenCalledTimes(2);
  });

  it("also reconciles a mutation response identity mismatch instead of allowing a second write", async () => {
    const mutate = vi.fn(async () => {
      throw providerFailure(ProviderResultClassification.IDENTITY_MISMATCH, "wrong deployment identity");
    });
    const result = await fixture().execute({
      resourceKey: "app:1", operationIdentity, mutate,
      readCurrent: async () => ({ value: { intendedSpecApplied: true } }),
      classifyReadback: (app) => app.intendedSpecApplied
        ? ProviderReadbackClassification.PROVEN_APPLIED
        : ProviderReadbackClassification.STILL_AMBIGUOUS,
    });
    expect(result).toMatchObject({
      classification: ProviderResultClassification.REQUEST_ACCEPTED,
      readbackClassification: ProviderReadbackClassification.PROVEN_APPLIED,
      mutationWasAmbiguous: true,
    });
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["accepted", async () => acceptedMutation, false],
    ["ambiguous", async () => { throw ambiguous(); }, true],
  ])("classifies a %s mutation whose readback proves not applied", async (_label, mutateImpl, mutationWasAmbiguous) => {
    const mutate = vi.fn(mutateImpl);
    const result = await fixture().execute({
      resourceKey: "domain-record:1", operationIdentity, mutate,
      readCurrent: async () => ({ value: { data: "windows.example" } }),
      classifyReadback: () => ProviderReadbackClassification.PROVEN_NOT_APPLIED,
    });
    expect(result).toMatchObject({
      classification: ProviderResultClassification.READBACK_MISMATCH,
      readbackClassification: ProviderReadbackClassification.PROVEN_NOT_APPLIED,
      mutationWasAmbiguous,
    });
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("keeps an unresolved guard after bounded readback remains ambiguous and allows only later read-only reconciliation", async () => {
    const mutate = vi.fn(async () => { throw ambiguous(); });
    const reconciler = fixture({ maximumReadbackAttempts: 2 });
    const inconclusive = await reconciler.execute({
      resourceKey: "domain-record:1", operationIdentity, mutate,
      readCurrent: async () => { throw providerFailure(ProviderResultClassification.READ_FAILED, "read failed"); },
      classifyReadback: () => ProviderReadbackClassification.STILL_AMBIGUOUS,
    });
    expect(inconclusive).toMatchObject({
      classification: ProviderResultClassification.MUTATION_UNRESOLVED,
      readbackClassification: ProviderReadbackClassification.STILL_AMBIGUOUS,
      readAttempts: 2,
    });
    expect(reconciler.hasUnresolvedMutation("domain-record:1")).toBe(true);

    const secondMutation = vi.fn(async () => acceptedMutation);
    await expect(reconciler.execute({
      resourceKey: "domain-record:1", operationIdentity: { operationId: "operation-2" }, mutate: secondMutation,
      readCurrent: async () => ({ value: null }), classifyReadback: () => ProviderReadbackClassification.PROVEN_APPLIED,
    })).rejects.toMatchObject({ classification: ProviderResultClassification.MUTATION_UNRESOLVED });
    expect(secondMutation).not.toHaveBeenCalled();

    const resolved = await reconciler.reconcileUnresolved({
      resourceKey: "domain-record:1", operationIdentity,
      readCurrent: async () => ({ value: { data: "provider.example" } }),
      classifyReadback: () => ProviderReadbackClassification.PROVEN_APPLIED,
    });
    expect(resolved.readbackClassification).toBe(ProviderReadbackClassification.PROVEN_APPLIED);
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(reconciler.hasUnresolvedMutation("domain-record:1")).toBe(false);
  });

  it("does no readback after a conclusive mutation rejection", async () => {
    const mutate = vi.fn(async () => { throw providerFailure(ProviderResultClassification.REQUEST_REJECTED, "HTTP 403"); });
    const readCurrent = vi.fn();
    await expect(fixture().execute({
      resourceKey: "domain-record:1", operationIdentity, mutate, readCurrent,
      classifyReadback: () => ProviderReadbackClassification.STILL_AMBIGUOUS,
    })).rejects.toMatchObject({ classification: ProviderResultClassification.REQUEST_REJECTED });
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(readCurrent).not.toHaveBeenCalled();
  });

  it("blocks concurrent mutation attempts against the same controlled resource", async () => {
    let release;
    const firstMutation = vi.fn(() => new Promise((resolve) => { release = resolve; }));
    const reconciler = fixture();
    const first = reconciler.execute({
      resourceKey: "app:1", operationIdentity, mutate: firstMutation,
      readCurrent: async () => ({ value: { ready: true } }),
      classifyReadback: () => ProviderReadbackClassification.PROVEN_APPLIED,
    });
    await Promise.resolve();
    const secondMutation = vi.fn(async () => acceptedMutation);
    await expect(reconciler.execute({
      resourceKey: "app:1", operationIdentity: { operationId: "operation-2" }, mutate: secondMutation,
      readCurrent: async () => ({ value: {} }), classifyReadback: () => ProviderReadbackClassification.PROVEN_APPLIED,
    })).rejects.toMatchObject({ classification: ProviderResultClassification.MUTATION_UNRESOLVED });
    expect(secondMutation).not.toHaveBeenCalled();
    release(acceptedMutation);
    await expect(first).resolves.toMatchObject({ readbackClassification: ProviderReadbackClassification.PROVEN_APPLIED });
  });
});

describe("exact provider identity polling", () => {
  it("polls the exact deployment through pending states to terminal success", async () => {
    const client = { getDeployment: vi.fn()
      .mockResolvedValueOnce({ value: { id: "deployment-1", phase: "BUILDING" } })
      .mockResolvedValueOnce({ value: { id: "deployment-1", phase: "ACTIVE" } }) };
    const clock = fakeClock();
    const result = await pollExactDigitalOceanDeployment({ client, appId: "app-1", deploymentId: "deployment-1", intervalMs: 10, deadlineMs: 100, ...clock });
    expect(result).toMatchObject({ pollClassification: ProviderPollClassification.TERMINAL_SUCCESS, providerIdentity: "deployment-1", state: "ACTIVE", polls: 2 });
    expect(client.getDeployment).toHaveBeenNthCalledWith(1, { appId: "app-1", deploymentId: "deployment-1" });
  });

  it("fails on terminal failure and unknown states", async () => {
    const terminalFailure = pollExactDigitalOceanAction({
      client: { getAction: async () => ({ value: { id: "action-1", status: "errored" } }) },
      actionId: "action-1", ...fakeClock(),
    });
    await expect(terminalFailure).rejects.toMatchObject({
      classification: ProviderResultClassification.READBACK_MISMATCH,
      evidence: { pollClassification: ProviderPollClassification.TERMINAL_FAILURE, state: "errored" },
    });

    const unknown = pollExactDigitalOceanAction({
      client: { getAction: async () => ({ value: { id: "action-1", status: "mysterious" } }) },
      actionId: "action-1", ...fakeClock(),
    });
    await expect(unknown).rejects.toMatchObject({ classification: ProviderResultClassification.READBACK_MISMATCH });
  });

  it("fails closed on the wrong exact identity", async () => {
    await expect(pollExactDigitalOceanDeployment({
      client: { getDeployment: async () => ({ value: { id: "deployment-2", phase: "ACTIVE" } }) },
      appId: "app-1", deploymentId: "deployment-1", ...fakeClock(),
    })).rejects.toMatchObject({ classification: ProviderResultClassification.IDENTITY_MISMATCH });
  });

  it("stops at a finite deadline without an unbounded poll", async () => {
    const read = vi.fn(async () => ({ value: { id: "resource-1", state: "pending" } }));
    const clock = fakeClock();
    await expect(pollExactProviderResource({
      read,
      expectedIdentity: "resource-1",
      selectIdentity: (value) => value.id,
      selectState: (value) => value.state,
      pending: ["pending"], success: ["done"], failure: ["failed"],
      deadlineMs: 15, intervalMs: 10, ...clock,
    })).rejects.toMatchObject({
      classification: ProviderResultClassification.READ_FAILED,
      evidence: { pollClassification: ProviderPollClassification.DEADLINE_EXCEEDED, polls: 2 },
    });
    expect(read).toHaveBeenCalledTimes(2);
  });
});

function fixture(extra = {}) {
  return createDigitalOceanMutationReconciler({ readbackIntervalMs: 0, ...extra });
}

function ambiguous() {
  return providerFailure(ProviderResultClassification.MUTATION_AMBIGUOUS, "ambiguous");
}

function fakeClock() {
  let value = 0;
  return {
    now: () => value,
    wait: async (ms) => { value += ms; },
  };
}
