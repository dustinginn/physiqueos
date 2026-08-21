import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { createDigitalOceanApiClient } from "../../provider/digitalocean/DigitalOceanApiClient.js";
import { createDigitalOceanMutationReconciler } from "../../provider/digitalocean/DigitalOceanMutationReconciler.js";
import {
  ProviderReadbackClassification,
  ProviderResultClassification,
} from "../../provider/digitalocean/DigitalOceanProviderContract.js";
import {
  PHASE7B_ROUTING_LEAF,
  PHASE7B_ROUTING_RECORD_TYPE,
  PHASE7B_ROUTING_TTL_SECONDS,
  PHASE7B_ROUTING_ZONE,
  createProductionDigitalOceanRoutingControl,
} from "./ProductionDigitalOceanRoutingControl.js";
import { RouteState, RoutingErrorCode } from "./combinedCutoverRoutingControl.js";
import { createDeterministicCombinedCutoverRoutingControl } from "./testSupport/deterministicRoutingControl.js";

const ZONE = PHASE7B_ROUTING_ZONE;
const LEAF = PHASE7B_ROUTING_LEAF;
const WINDOWS_TARGET = "windows-edge.example.net";
const PROVIDER_TARGET = "physiqueos-app.ondigitalocean.app";
const TTL = PHASE7B_ROUTING_TTL_SECONDS;
const OPERATION = Object.freeze({ operationId: "phase7b-routing-op-1", commandId: "phase7b-route-command-1" });

describe.each([
  ["deterministic double", (initialState) => ({
    routing: createDeterministicCombinedCutoverRoutingControl({ initialRouteState: initialState }),
    routingTarget: PROVIDER_TARGET,
  })],
  ["production adapter with mocked DigitalOcean transport", (initialState) => {
    const initialTarget = initialState === RouteState.PROVIDER_ACTIVE ? PROVIDER_TARGET : WINDOWS_TARGET;
    const fixture = providerFixture({ initialTarget });
    return { routing: fixture.routing, routingTarget: PROVIDER_TARGET };
  }],
])("routing contract parity — %s", (_label, factory) => {
  it("inspects Windows, activates provider, and verifies provider", async () => {
    const { routing, routingTarget } = factory(RouteState.WINDOWS_ACTIVE);
    expect((await routing.inspectCurrentRoute({ routingTarget })).routeState).toBe(RouteState.WINDOWS_ACTIVE);
    const activated = await routing.activateProviderRoute({ routingTarget, operationIdentity: OPERATION });
    expect(activated).toMatchObject({ routeState: RouteState.PROVIDER_ACTIVE, outcome: "activated" });
    await expect(routing.verifyProviderRoute({ routingTarget, expectedRecordId: activated.recordId })).resolves.toMatchObject({ ready: true, routeState: RouteState.PROVIDER_ACTIVE });
  });

  it("treats provider activation as idempotent when provider is already exact", async () => {
    const { routing, routingTarget } = factory(RouteState.PROVIDER_ACTIVE);
    await expect(routing.activateProviderRoute({ routingTarget, operationIdentity: OPERATION })).resolves.toMatchObject({
      routeState: RouteState.PROVIDER_ACTIVE, outcome: "idempotent-replay",
    });
  });

  it("restores provider to Windows and treats an already-Windows restore as idempotent", async () => {
    const active = factory(RouteState.PROVIDER_ACTIVE);
    await expect(active.routing.restoreWindowsRoute({ routingTarget: active.routingTarget, operationIdentity: OPERATION })).resolves.toMatchObject({
      routeState: RouteState.WINDOWS_ACTIVE, outcome: "restored",
    });
    const windows = factory(RouteState.WINDOWS_ACTIVE);
    await expect(windows.routing.restoreWindowsRoute({ routingTarget: windows.routingTarget, operationIdentity: OPERATION })).resolves.toMatchObject({
      routeState: RouteState.WINDOWS_ACTIVE, outcome: "idempotent-replay",
    });
  });
});

describe("ProductionDigitalOceanRoutingControl inspection", () => {
  it("keeps authority, workers, zone creation, and live transport outside the routing adapter", async () => {
    const source = await readFile(new URL("./ProductionDigitalOceanRoutingControl.js", import.meta.url), "utf8");
    for (const forbidden of [
      "CombinedRuntimeAuthorityState", "claimCanonicalWriteBoundary", "workerControl", "globalThis.fetch",
      "client.createDomain(", "client.createDomainRecord(", "client.deleteDomainRecord(",
    ]) expect(source).not.toContain(forbidden);
  });

  it("requires explicit unresolved live targets and the non-apex controlled leaf", () => {
    const fixture = providerFixture();
    expect(() => createProductionDigitalOceanRoutingControl({
      client: fixture.client,
      zone: ZONE,
      leafFqdn: ZONE,
      windowsTarget: WINDOWS_TARGET,
      providerTarget: PROVIDER_TARGET,
    })).toThrow(/non-apex/);
    expect(() => createProductionDigitalOceanRoutingControl({
      client: fixture.client,
      zone: ZONE,
      leafFqdn: LEAF,
      windowsTarget: WINDOWS_TARGET,
    })).toThrow(/providerTarget/);
  });

  it("controls exactly the configured child-zone CNAME leaf and normalizes only DNS trailing dots/case", async () => {
    const fixture = providerFixture({ initialTarget: `${WINDOWS_TARGET.toUpperCase()}.` });
    const result = await fixture.routing.inspectCurrentRoute({ routingTarget: `${PROVIDER_TARGET}.` });
    expect(result).toMatchObject({
      routeState: RouteState.WINDOWS_ACTIVE,
      recordId: "7",
      targetRole: "windows",
      ttl: TTL,
      evidence: {
        zone: ZONE,
        leafFqdn: LEAF,
        expectedRecordType: PHASE7B_ROUTING_RECORD_TYPE,
        expectedTtl: TTL,
        providerZoneIdentity: ZONE,
      },
      verificationScope: "provider-record-state-only",
    });
    expect(result.externalTrafficProofsRequired).toEqual([
      "authoritative-dns-answer", "public-dns-answer", "windows-custom-domain-edge-readiness",
      "provider-custom-domain-attachment", "tls-certificate-readiness", "host-sni-routing",
      "https-provider-build-identity",
    ]);
    expect(fixture.lastListQuery()).toMatchObject({ name: LEAF, page: "1", per_page: "200" });
    expect(JSON.stringify(result)).not.toContain(WINDOWS_TARGET);
    expect(JSON.stringify(result)).not.toContain(PROVIDER_TARGET);
  });

  it.each([
    ["record missing", [], RouteState.UNPREPARED],
    ["multiple records", [record({ id: 7 }), record({ id: 8 })], RouteState.MULTIPLE_MATCHING_RECORDS],
    ["wrong record type", [record({ type: "A", data: "192.0.2.5" })], RouteState.UNEXPECTED_RECORD_TYPE],
    ["unexpected target", [record({ data: "third-party.example.net" })], RouteState.UNEXPECTED_TARGET],
    ["wrong TTL", [record({ ttl: 1800 })], RouteState.TTL_MISMATCH],
    ["wrong returned name", [record({ name: "other" })], RouteState.RECORD_IDENTITY_MISMATCH],
  ])("classifies %s without mutation", async (_label, records, expectedState) => {
    const fixture = providerFixture({ records });
    await expect(fixture.routing.inspectCurrentRoute({ routingTarget: PROVIDER_TARGET })).resolves.toMatchObject({ routeState: expectedState });
    expect(fixture.mutationCalls()).toBe(0);
  });

  it("classifies a missing zone as unprepared and an unavailable provider read as ambiguous", async () => {
    const missing = providerFixture({ domainStatus: 404 });
    await expect(missing.routing.inspectCurrentRoute({ routingTarget: PROVIDER_TARGET })).resolves.toMatchObject({ routeState: RouteState.UNPREPARED });
    const unavailable = providerFixture({ domainStatus: 503 });
    await expect(unavailable.routing.inspectCurrentRoute({ routingTarget: PROVIDER_TARGET })).resolves.toMatchObject({ routeState: RouteState.AMBIGUOUS });
  });

  it("fails provider verification on record identity drift and never claims provider readback proves traffic", async () => {
    const fixture = providerFixture({ initialTarget: PROVIDER_TARGET });
    await expect(fixture.routing.verifyProviderRoute({ routingTarget: PROVIDER_TARGET, expectedRecordId: 999 }))
      .rejects.toMatchObject({ code: RoutingErrorCode.IDENTITY_MISMATCH });
    const verified = await fixture.routing.verifyProviderRoute({ routingTarget: PROVIDER_TARGET, expectedRecordId: 7 });
    expect(verified).toMatchObject({ providerRecordStateVerified: true, verificationScope: "provider-record-state-only" });
    expect(verified.externalTrafficProofsRequired).toContain("https-provider-build-identity");
  });
});

describe("ProductionDigitalOceanRoutingControl mutation ambiguity", () => {
  it("accepts one update only after exact provider readback", async () => {
    const fixture = providerFixture({ mutationMode: "success" });
    const result = await fixture.routing.activateProviderRoute({ routingTarget: PROVIDER_TARGET, operationIdentity: OPERATION });
    expect(result).toMatchObject({ routeState: RouteState.PROVIDER_ACTIVE, outcome: "activated" });
    expect(result.evidence).toMatchObject({
      attemptedTargetRole: "provider",
      providerMutationClassification: ProviderResultClassification.REQUEST_ACCEPTED,
      readbackClassification: ProviderReadbackClassification.PROVEN_APPLIED,
    });
    expect(fixture.mutationCalls()).toBe(1);
    expect(fixture.lastMutationBody()).toEqual({ type: "CNAME", name: "app", data: PROVIDER_TARGET, ttl: TTL });
    expect(JSON.stringify(result)).not.toContain(PROVIDER_TARGET);
    expect(JSON.stringify(result)).not.toContain(WINDOWS_TARGET);
  });

  it("fails a conclusive provider rejection without retry or readback", async () => {
    const fixture = providerFixture({ mutationMode: "reject" });
    const error = await capture(fixture.routing.activateProviderRoute({ routingTarget: PROVIDER_TARGET, operationIdentity: OPERATION }));
    expect(error).toMatchObject({
      code: RoutingErrorCode.ACTIVATION_FAILED,
      providerMutationClassification: ProviderResultClassification.REQUEST_REJECTED,
      operationIdentity: OPERATION,
    });
    expect(fixture.mutationCalls()).toBe(1);
    expect(fixture.recordListReads()).toBe(1);
  });

  it.each([
    ["timeout after apply", "timeout-applied"],
    ["connection reset after apply", "reset-applied"],
    ["malformed successful response after apply", "malformed-applied"],
  ])("reconciles %s as PROVEN_APPLIED with one mutation", async (_label, mutationMode) => {
    const fixture = providerFixture({ mutationMode });
    const result = await fixture.routing.activateProviderRoute({ routingTarget: PROVIDER_TARGET, operationIdentity: OPERATION });
    expect(result.evidence).toMatchObject({
      providerMutationClassification: ProviderResultClassification.MUTATION_AMBIGUOUS,
      readbackClassification: ProviderReadbackClassification.PROVEN_APPLIED,
    });
    expect(fixture.mutationCalls()).toBe(1);
  });

  it("classifies timeout with prior Windows readback as PROVEN_NOT_APPLIED and does not retry", async () => {
    const fixture = providerFixture({ mutationMode: "timeout-not-applied" });
    const error = await capture(fixture.routing.activateProviderRoute({ routingTarget: PROVIDER_TARGET, operationIdentity: OPERATION }));
    expect(error).toMatchObject({ code: RoutingErrorCode.ACTIVATION_FAILED });
    expect(error.readbackClassification ?? error.evidence?.readbackClassification).toBe(ProviderReadbackClassification.PROVEN_NOT_APPLIED);
    expect(fixture.mutationCalls()).toBe(1);
  });

  it("classifies unavailable/unknown readback as STILL_AMBIGUOUS and blocks another mutation", async () => {
    const fixture = providerFixture({ mutationMode: "timeout-unknown" });
    const first = await capture(fixture.routing.activateProviderRoute({ routingTarget: PROVIDER_TARGET, operationIdentity: OPERATION }));
    expect(first).toMatchObject({ code: RoutingErrorCode.AMBIGUOUS, mutationAttempted: true });
    expect(first.readbackClassification ?? first.evidence?.readbackClassification).toBe(ProviderReadbackClassification.STILL_AMBIGUOUS);
    const second = await capture(fixture.routing.activateProviderRoute({
      routingTarget: PROVIDER_TARGET,
      operationIdentity: { operationId: "phase7b-routing-op-2", commandId: "phase7b-route-command-2" },
    }));
    expect(second).toMatchObject({ code: RoutingErrorCode.AMBIGUOUS });
    expect(fixture.mutationCalls()).toBe(1);
  });

  it("distinguishes an ambiguous read-only precondition from a dispatched mutation", async () => {
    const fixture = providerFixture({ domainStatus: 503 });
    const error = await capture(fixture.routing.activateProviderRoute({ routingTarget: PROVIDER_TARGET, operationIdentity: OPERATION }));
    expect(error).toMatchObject({ code: RoutingErrorCode.AMBIGUOUS });
    expect(error.mutationAttempted).not.toBe(true);
    expect(fixture.mutationCalls()).toBe(0);
  });

  it("fails closed when an accepted mutation reads back an unexpected target", async () => {
    const fixture = providerFixture({ mutationMode: "accepted-wrong-readback" });
    const error = await capture(fixture.routing.activateProviderRoute({ routingTarget: PROVIDER_TARGET, operationIdentity: OPERATION }));
    expect(error).toMatchObject({ code: RoutingErrorCode.AMBIGUOUS, mutationAttempted: true });
    expect(fixture.mutationCalls()).toBe(1);
  });

  it("prevents concurrent mutations against the same route resource", async () => {
    const fixture = providerFixture({ mutationMode: "controlled", requestTimeoutMs: 500 });
    const first = fixture.routing.activateProviderRoute({ routingTarget: PROVIDER_TARGET, operationIdentity: OPERATION });
    await waitUntil(() => fixture.mutationCalls() === 1);
    const second = await capture(fixture.routing.activateProviderRoute({
      routingTarget: PROVIDER_TARGET,
      operationIdentity: { operationId: "phase7b-routing-op-2", commandId: "phase7b-route-command-2" },
    }));
    expect(second).toMatchObject({ code: RoutingErrorCode.AMBIGUOUS });
    expect(fixture.mutationCalls()).toBe(1);
    fixture.releaseMutation();
    await expect(first).resolves.toMatchObject({ routeState: RouteState.PROVIDER_ACTIVE });
  });
});

describe("ProductionDigitalOceanRoutingControl recovery", () => {
  it("restores exact provider state to exact Windows state with one update and readback", async () => {
    const fixture = providerFixture({ initialTarget: PROVIDER_TARGET });
    const result = await fixture.routing.restoreWindowsRoute({ routingTarget: PROVIDER_TARGET, operationIdentity: OPERATION });
    expect(result).toMatchObject({ routeState: RouteState.WINDOWS_ACTIVE, outcome: "restored" });
    expect(result.evidence).toMatchObject({ attemptedTargetRole: "windows", readbackClassification: ProviderReadbackClassification.PROVEN_APPLIED });
    expect(fixture.mutationCalls()).toBe(1);
  });

  it.each([
    ["unknown third-party target", [record({ data: "third-party.example.net" })]],
    ["multiple records", [record({ id: 7, data: PROVIDER_TARGET }), record({ id: 8, data: PROVIDER_TARGET })]],
    ["wrong type", [record({ type: "TXT", data: PROVIDER_TARGET })]],
    ["missing record", []],
  ])("never blindly overwrites %s", async (_label, records) => {
    const fixture = providerFixture({ records });
    await expect(fixture.routing.restoreWindowsRoute({ routingTarget: PROVIDER_TARGET, operationIdentity: OPERATION })).rejects.toBeTruthy();
    expect(fixture.mutationCalls()).toBe(0);
  });

  it("uses only injected mock transport and never global fetch", async () => {
    const globalFetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("LIVE_NETWORK_DISABLED"));
    try {
      const fixture = providerFixture();
      await fixture.routing.inspectCurrentRoute({ routingTarget: PROVIDER_TARGET });
      expect(globalFetch).not.toHaveBeenCalled();
    } finally {
      globalFetch.mockRestore();
    }
  });
});

function providerFixture({
  initialTarget = WINDOWS_TARGET,
  records = null,
  domainStatus = 200,
  mutationMode = "success",
  requestTimeoutMs = 10,
} = {}) {
  let currentRecords = records ?? [record({ data: initialTarget })];
  let mutationCount = 0;
  let listReads = 0;
  let lastList = null;
  let lastMutation = null;
  let readbackUnavailable = false;
  let release = null;

  const fetchImpl = vi.fn(async (url, init) => {
    const requested = new URL(url);
    const method = init.method;
    if (method === "GET" && requested.pathname === `/v2/domains/${ZONE}`) {
      return domainStatus === 200 ? json({ domain: { name: ZONE, ttl: 1800 } }) : json({ message: "unavailable" }, domainStatus);
    }
    if (method === "GET" && requested.pathname === `/v2/domains/${ZONE}/records`) {
      listReads += 1;
      lastList = Object.fromEntries(requested.searchParams);
      if (readbackUnavailable) return json({ message: "readback unavailable" }, 503);
      return json({ domain_records: currentRecords, links: {}, meta: { total: currentRecords.length } });
    }
    if (method === "PUT" && requested.pathname === `/v2/domains/${ZONE}/records/7`) {
      mutationCount += 1;
      const body = JSON.parse(init.body);
      lastMutation = body;
      const updated = { ...currentRecords[0], ...body, id: 7 };
      if (mutationMode === "reject") return json({ message: "rejected" }, 409);
      if (mutationMode === "timeout-applied") { currentRecords = [updated]; return new Promise(() => {}); }
      if (mutationMode === "timeout-not-applied") return new Promise(() => {});
      if (mutationMode === "timeout-unknown") { readbackUnavailable = true; return new Promise(() => {}); }
      if (mutationMode === "reset-applied") { currentRecords = [updated]; throw new Error("ECONNRESET"); }
      if (mutationMode === "malformed-applied") { currentRecords = [updated]; return text("{truncated", 200, "application/json"); }
      if (mutationMode === "accepted-wrong-readback") {
        currentRecords = [{ ...updated, data: "third-party.example.net" }];
        return json({ domain_record: updated });
      }
      if (mutationMode === "controlled") {
        return new Promise((resolve) => {
          release = () => { currentRecords = [updated]; resolve(json({ domain_record: updated })); };
        });
      }
      currentRecords = [updated];
      return json({ domain_record: updated });
    }
    throw new Error(`Unexpected mock request ${method} ${requested.pathname}`);
  });

  const client = createDigitalOceanApiClient({
    accessToken: ["dop", "v1", "fixture-token"].join("_"),
    fetchImpl,
    requestTimeoutMs,
  });
  const mutationReconciler = createDigitalOceanMutationReconciler({ maximumReadbackAttempts: 2, readbackIntervalMs: 0 });
  const routing = createProductionDigitalOceanRoutingControl({
    client,
    mutationReconciler,
    zone: ZONE,
    leafFqdn: LEAF,
    windowsTarget: WINDOWS_TARGET,
    providerTarget: PROVIDER_TARGET,
    expectedTtl: TTL,
  });
  return Object.freeze({
    routing,
    client,
    fetchImpl,
    mutationCalls: () => mutationCount,
    recordListReads: () => listReads,
    lastListQuery: () => lastList,
    lastMutationBody: () => lastMutation,
    releaseMutation: () => {
      if (!release) throw new Error("No controlled mutation is waiting.");
      release();
    },
  });
}

function record(overrides = {}) {
  return { id: 7, type: "CNAME", name: "app", data: WINDOWS_TARGET, ttl: TTL, ...overrides };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function text(body, status, contentType) {
  return new Response(body, { status, headers: { "content-type": contentType } });
}

async function capture(promise) {
  try {
    await promise;
    throw new Error("Expected promise to reject.");
  } catch (error) {
    return error;
  }
}

async function waitUntil(predicate) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Timed out waiting for deterministic fixture state.");
}
