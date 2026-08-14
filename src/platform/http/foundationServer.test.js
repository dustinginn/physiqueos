import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createFoundationRequestHandler } from "./foundationServer";

const operationsToken = "synthetic-operations-token-32-characters";
const buildIdentity = Object.freeze({ buildId: "phase2-test", apiVersion: "v1" });
const readiness = Object.freeze({
  status: "ready",
  buildId: "phase2-test",
  apiVersion: "v1",
  checks: Object.freeze([{ name: "database", ready: true, code: "DATABASE_REACHABLE" }]),
});
const servers = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

describe("foundation-only HTTP server", () => {
  it("keeps public readiness minimal and protects deeper status", async () => {
    const base = await listen(createFoundationRequestHandler({ getReadiness: async () => readiness, buildIdentity, operationsToken }));
    const publicResponse = await fetch(`${base}/api/v1/health/ready`);
    expect(publicResponse.status).toBe(200);
    const publicBody = await publicResponse.json();
    expect(publicBody).toMatchObject({ status: "ready", code: "DEPENDENCIES_READY", buildId: "phase2-test" });
    expect(publicBody).not.toHaveProperty("checks");

    expect((await fetch(`${base}/api/v1/operations/status`)).status).toBe(401);
    expect((await fetch(`${base}/api/v1/operations/status`, { headers: { authorization: "Bearer wrong-token" } })).status).toBe(401);
    const protectedResponse = await fetch(`${base}/api/v1/operations/status`, { headers: { authorization: `Bearer ${operationsToken}` } });
    expect(protectedResponse.status).toBe(200);
    expect(await protectedResponse.json()).toMatchObject({ status: "ready", checks: [{ name: "database", ready: true }] });
  });

  it("exposes only foundation routes and fails product APIs closed", async () => {
    const base = await listen(createFoundationRequestHandler({ getReadiness: async () => readiness, buildIdentity, operationsToken }));
    expect((await fetch(`${base}/api/v1/health/live`)).status).toBe(200);
    expect(await (await fetch(`${base}/api/v1/platform`)).json()).toMatchObject({ status: "inactive", code: "FOUNDATION_PRODUCT_APIS_INACTIVE" });
    expect((await fetch(`${base}/`)).status).toBe(404);
    expect((await fetch(`${base}/log`)).status).toBe(404);
    expect((await fetch(`${base}/api/v1/health/live`, { method: "POST" })).status).toBe(405);
  });

  it("returns only a redacted stable error when readiness throws", async () => {
    const base = await listen(createFoundationRequestHandler({
      getReadiness: async () => { throw new Error("postgresql://secret@example.invalid/private"); },
      buildIdentity,
      operationsToken,
      logger: { error() {} },
    }));
    const response = await fetch(`${base}/api/v1/health/ready`);
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("secret");
  });

  it("protects the bounded remote dry-run submit/status surface and never accepts arbitrary methods", async () => {
    const migrationDryRun = {
      submit: async (payload) => ({ status: 202, body: { operationId: payload.operationId, state: "queued", finalClassification: "PENDING" } }),
      status: async (operationId) => ({ status: 200, body: { operationId, state: "succeeded", finalClassification: "READY" } }),
    };
    const base = await listen(createFoundationRequestHandler({ getReadiness: async () => readiness, buildIdentity, operationsToken, migrationDryRun }));
    const route = `${base}/api/v1/operations/production-migration-dry-runs`;
    expect((await fetch(route, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status).toBe(401);
    expect((await fetch(route, { method: "POST", headers: { authorization: "Bearer wrong", "content-type": "application/json" }, body: "{}" })).status).toBe(401);
    const submitted = await fetch(route, {
      method: "POST",
      headers: { authorization: `Bearer ${operationsToken}`, "content-type": "application/json" },
      body: JSON.stringify({ operationId: "remote-dry-run-0001" }),
    });
    expect(submitted.status).toBe(202);
    expect(await submitted.json()).toMatchObject({ operationId: "remote-dry-run-0001", state: "queued" });
    const status = await fetch(`${route}/remote-dry-run-0001`, { headers: { authorization: `Bearer ${operationsToken}` } });
    expect(status.status).toBe(200);
    expect(await status.json()).toMatchObject({ state: "succeeded", finalClassification: "READY" });
    expect((await fetch(`${route}/remote-dry-run-0001`, { method: "DELETE", headers: { authorization: `Bearer ${operationsToken}` } })).status).toBe(405);
  });
});

async function listen(handler) {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
